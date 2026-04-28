import RNFS from 'react-native-fs';
import { ModelFile, BackgroundDownloadInfo } from '../../types';
import { huggingFaceService } from '../huggingface';
import { backgroundDownloadService } from '../backgroundDownloadService';
import {
  DownloadProgressCallback,
  DownloadCompleteCallback,
  DownloadErrorCallback,
  BackgroundDownloadMetadataCallback,
  BackgroundDownloadContext,
} from './types';
import { buildDownloadedModel, persistDownloadedModel, loadDownloadedModels, saveModelsList } from './storage';
import logger from '../../utils/logger';
import { useDownloadStore } from '../../stores/downloadStore';
import { makeModelKey } from '../../utils/modelKey';

export function mmProjLocalName(ggufFileName: string): string {
  return `${ggufFileName.replace(/\.gguf$/i, '')}-mmproj.gguf`;
}

function makeAlreadyDownloadedId(modelId: string, fileName: string): string {
  return `already-downloaded:${makeModelKey(modelId, fileName)}`;
}

export {
  getOrphanedTextFiles,
  getOrphanedImageDirs,
  syncCompletedBackgroundDownloads,
} from './downloadHelpers';
export type { SyncDownloadsOpts } from './downloadHelpers';

export interface PerformBackgroundDownloadOpts {
  modelId: string;
  file: ModelFile;
  modelsDir: string;
  backgroundDownloadContext: Map<string, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

export async function performBackgroundDownload(opts: PerformBackgroundDownloadOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;
  const localPath = `${modelsDir}/${file.name}`;
  const mmProjLocalPath = file.mmProjFile
    ? `${modelsDir}/${mmProjLocalName(file.name)}`
    : null;

  const mainExists = await RNFS.exists(localPath);
  const mmProjExists = await checkMmProjExists(mmProjLocalPath, file.mmProjFile?.size);

  if (mainExists && mmProjExists) {
    return handleAlreadyDownloaded({ modelId, file, localPath, mmProjLocalPath, backgroundDownloadContext });
  }

  return startBgDownload({
    modelId, file, localPath, mmProjLocalPath, mmProjExists,
    modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress,
  });
}

async function checkMmProjExists(path: string | null, expectedSize?: number): Promise<boolean> {
  if (!path) return true;
  const exists = await RNFS.exists(path);
  if (!exists || !expectedSize) return exists;
  try {
    const stat = await RNFS.stat(path);
    const actualSize = typeof stat.size === 'string' ? Number.parseInt(stat.size, 10) : stat.size;
    if (actualSize < expectedSize) {
      logger.warn(`[ModelManager] mmproj partial (${actualSize}/${expectedSize}), re-downloading`);
      await RNFS.unlink(path).catch(() => {});
      return false;
    }
    return true;
  } catch {
    await RNFS.unlink(path).catch(() => {});
    return false;
  }
}

interface AlreadyDownloadedOpts {
  modelId: string;
  file: ModelFile;
  localPath: string;
  mmProjLocalPath: string | null;
  backgroundDownloadContext: Map<string, BackgroundDownloadContext>;
}

async function handleAlreadyDownloaded(opts: AlreadyDownloadedOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, localPath, mmProjLocalPath, backgroundDownloadContext } = opts;
  const model = await buildDownloadedModel({ modelId, file, resolvedLocalPath: localPath, mmProjPath: mmProjLocalPath || undefined });
  const totalBytes = file.size + (file.mmProjFile?.size || 0);
  const downloadId = makeAlreadyDownloadedId(modelId, file.name);
  const completedInfo: BackgroundDownloadInfo = {
    downloadId, fileName: file.name, modelId, status: 'completed',
    bytesDownloaded: totalBytes, totalBytes, startedAt: Date.now(),
  };
  backgroundDownloadContext.set(downloadId, { model, error: null });
  return completedInfo;
}

interface StartBgDownloadOpts {
  modelId: string;
  file: ModelFile;
  localPath: string;
  mmProjLocalPath: string | null;
  mmProjExists: boolean;
  modelsDir: string;
  backgroundDownloadContext: Map<string, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

async function startBgDownload(opts: StartBgDownloadOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, localPath, mmProjLocalPath, mmProjExists, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;

  const mmProjSize = file.mmProjFile?.size || 0;
  const combinedTotalBytes = file.size + mmProjSize;
  const downloadUrl = huggingFaceService.getDownloadUrl(modelId, file.name);
  const author = modelId.split('/')[0] || 'Unknown';
  const modelKey = makeModelKey(modelId, file.name);

  const downloadInfo = await backgroundDownloadService.startDownload({
    url: downloadUrl,
    fileName: file.name,
    modelId,
    modelKey,
    modelType: 'text',
    quantization: file.quantization,
    combinedTotalBytes,
    totalBytes: file.size,
    sha256: file.sha256,
  });

  // Populate new store immediately — no awaits between startDownload and add().
  // If a non-active entry already exists for this modelKey (e.g. previous run
  // ended in 'failed' and the user is starting again), reuse the same logical
  // record via retryEntry instead of overwriting via add(). add() is strict
  // and refuses to clobber any existing entry.
  const needsMmProj = !!(file.mmProjFile && mmProjLocalPath && !mmProjExists);
  const existing = useDownloadStore.getState().downloads[modelKey];
  if (existing) {
    // Cancel any running/queued native worker before retryEntry swaps the
    // downloadId. Without this, the old worker keeps running with no store
    // listener after the index is updated to the new downloadId.
    await backgroundDownloadService.cancelDownload(existing.downloadId).catch(() => {});
    if (existing.mmProjDownloadId) {
      await backgroundDownloadService.cancelDownload(existing.mmProjDownloadId).catch(() => {});
    }
    useDownloadStore.getState().retryEntry(modelKey, downloadInfo.downloadId);
  } else {
    useDownloadStore.getState().add({
      modelKey,
      downloadId: downloadInfo.downloadId,
      modelId,
      fileName: file.name,
      quantization: file.quantization,
      modelType: 'text',
      status: 'pending',
      bytesDownloaded: 0,
      totalBytes: file.size,
      combinedTotalBytes,
      progress: 0,
      createdAt: Date.now(),
      ...(needsMmProj && {
        mmProjFileName: mmProjLocalName(file.name),
        mmProjFileSize: file.mmProjFile?.size,
      }),
    });
  }

  // Start mmproj download in parallel if needed
  let mmProjDownloadId: string | undefined;
  if (needsMmProj) {
    const mmProjFile = file.mmProjFile!;
    const mmProjInfo = await backgroundDownloadService.startDownload({
      url: mmProjFile.downloadUrl,
      fileName: mmProjLocalName(file.name),
      modelId,
      modelType: 'text',
      totalBytes: mmProjFile.size,
      sha256: mmProjFile.sha256,
    });
    mmProjDownloadId = mmProjInfo.downloadId;
    // Register mmproj in store immediately after startDownload resolves.
    useDownloadStore.getState().setMmProjDownloadId(modelKey, mmProjDownloadId);
  }

  backgroundDownloadMetadataCallback?.(downloadInfo.downloadId as any, {
    modelId, fileName: file.name, quantization: file.quantization, author,
    totalBytes: combinedTotalBytes, mainFileSize: file.size,
    mmProjFileName: mmProjLocalPath ? mmProjLocalPath.split('/').pop() : file.mmProjFile?.name, mmProjFileSize: mmProjSize,
    mmProjLocalPath, mmProjDownloadId: mmProjDownloadId as any,
  });

  // Combined progress tracking
  let mainBytesDownloaded = 0;
  let mmProjBytesDownloaded = mmProjExists ? mmProjSize : 0;
  const mmProjFileName = file.mmProjFile?.name || '';

  const reportProgress = () => {
    const combinedDownloaded = mainBytesDownloaded + mmProjBytesDownloaded;

    // Update Android notification with combined progress for vision models
    if (needsMmProj && mmProjDownloadId) {
      try {
        const { DownloadManagerModule } = require('react-native').NativeModules as {
          DownloadManagerModule?: {
            updateCombinedProgress?: (
              modelId: string,
              fileName: string,
              mmProjFileName: string,
              mainBytesDownloaded: number,
              mainTotalBytes: number,
              mmProjBytesDownloaded: number,
              mmProjTotalBytes: number,
            ) => void;
          };
        };
        if (typeof DownloadManagerModule?.updateCombinedProgress === 'function') {
          DownloadManagerModule.updateCombinedProgress(
            modelId,
            file.name,
            mmProjFileName,
            mainBytesDownloaded,
            file.size,
            mmProjBytesDownloaded,
            mmProjSize,
          );
        }
      } catch {
        // Best-effort notification update only.
      }
    }

    onProgress?.({
      downloadId: downloadInfo.downloadId,
      modelId, fileName: file.name, bytesDownloaded: combinedDownloaded,
      totalBytes: combinedTotalBytes,
      progress: combinedTotalBytes > 0 ? combinedDownloaded / combinedTotalBytes : 0,
    });
  };

  const removeProgressListener = backgroundDownloadService.onProgress(
    downloadInfo.downloadId, (event) => {
      mainBytesDownloaded = event.bytesDownloaded; reportProgress();
    },
  );

  let removeMmProjProgressListener: (() => void) | undefined;
  if (mmProjDownloadId) {
    removeMmProjProgressListener = backgroundDownloadService.onProgress(
      mmProjDownloadId, (event) => {
        mmProjBytesDownloaded = event.bytesDownloaded; reportProgress();
      },
    );
  }

  // Cast to any: this context map and all callers are removed in Step 5.
  (backgroundDownloadContext as Map<any, any>).set(downloadInfo.downloadId, {
    modelId, file, localPath, mmProjLocalPath, removeProgressListener,
    mmProjDownloadId, mmProjCompleted: !needsMmProj, mainCompleted: false,
    mainCompleteHandled: false, mmProjCompleteHandled: false, isFinalizing: false,
    removeMmProjProgressListener,
  });

  backgroundDownloadService.startProgressPolling();
  return downloadInfo;
}

export interface WatchDownloadOpts {
  downloadId: string;
  modelsDir: string;
  backgroundDownloadContext: Map<any, any>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onComplete?: DownloadCompleteCallback;
  onError?: DownloadErrorCallback;
}

export function watchBackgroundDownload(opts: WatchDownloadOpts): void {
  const { downloadId, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onComplete, onError } = opts;
  const ctx = backgroundDownloadContext.get(downloadId);
  const isAlreadyDownloaded = typeof downloadId === 'string' && downloadId.startsWith('already-downloaded:');

  if (isAlreadyDownloaded && ctx && 'model' in ctx) {
    if (ctx.model) onComplete?.(ctx.model);
    else if (ctx.error) onError?.(ctx.error);
    backgroundDownloadContext.delete(downloadId);
    return;
  }

  if (!ctx || !('file' in ctx)) return;

  let removeMmProjComplete: (() => void) | undefined;
  let removeMmProjError: (() => void) | undefined;

  const cleanupListeners = () => {
    ctx.removeProgressListener();
    ctx.removeMmProjProgressListener?.();
    removeMainComplete();
    removeMainError();
    removeMmProjComplete?.();
    removeMmProjError?.();
  };

  const handleError = (error: Error, cancelDownloadId?: string) => {
    if (cancelDownloadId) backgroundDownloadService.cancelDownload(cancelDownloadId).catch(() => {});
    cleanupListeners();
    backgroundDownloadContext.delete(downloadId);
    onError?.(error);
  };

  const tryFinalize = async () => {
    if (!ctx.mainCompleted || !ctx.mmProjCompleted) return;
    if (ctx.isFinalizing) return;
    ctx.isFinalizing = true;
    cleanupListeners();
    backgroundDownloadContext.delete(downloadId);
    try {
      const finalPath = await backgroundDownloadService.moveCompletedDownload(downloadId, ctx.localPath);
      const mmProjFileExists = ctx.mmProjLocalPath ? await RNFS.exists(ctx.mmProjLocalPath) : false;
      const finalMmProjPath = ctx.mmProjLocalPath && mmProjFileExists ? ctx.mmProjLocalPath : undefined;

      const model = await buildDownloadedModel({
        modelId: ctx.modelId, file: ctx.file, resolvedLocalPath: finalPath, mmProjPath: finalMmProjPath,
        // If the sidecar download failed, mmProjPath is undefined but we still know
        // the intended filename from the catalog. This sentinel triggers needsVisionRepair
        // without any name-based heuristic so the "Repair Vision" button always appears.
        expectedMmProjFileName: !finalMmProjPath ? ctx.file.mmProjFile?.name : undefined,
      });
      await persistDownloadedModel(model, modelsDir);
      backgroundDownloadMetadataCallback?.(downloadId, null);
      onComplete?.(model);
    } catch (error) {
      ctx.isFinalizing = false;
      onError?.(error as Error);
    }
  };

  const removeMainComplete = backgroundDownloadService.onComplete(downloadId, async () => {
    if (ctx.mainCompleteHandled) return;
    ctx.mainCompleteHandled = true;
    ctx.mainCompleted = true;
    await tryFinalize();
  });
  const removeMainError = backgroundDownloadService.onError(downloadId, (event) => {
    handleError(new Error(event.reason || 'Download failed'), ctx.mmProjDownloadId);
  });

  if (ctx.mmProjDownloadId && !ctx.mmProjCompleted) {
    removeMmProjComplete = backgroundDownloadService.onComplete(ctx.mmProjDownloadId, async (event) => {
      if (ctx.mmProjCompleteHandled) return;
      ctx.mmProjCompleteHandled = true;
      try {
        await backgroundDownloadService.moveCompletedDownload(event.downloadId, ctx.mmProjLocalPath!);
      } catch (moveErr) {
        const targetExists = ctx.mmProjLocalPath ? await RNFS.exists(ctx.mmProjLocalPath) : false;
        if (!targetExists) {
          logger.warn('[ModelManager] mmproj move failed and target not found, continuing without vision:', moveErr);
          ctx.mmProjLocalPath = null;
        }
      }
      ctx.mmProjCompleted = true;
      await tryFinalize();
    });
    removeMmProjError = backgroundDownloadService.onError(ctx.mmProjDownloadId, (event) => {
      // mmproj failure must NOT fail the parent download. Treat as
      // text-only-with-repair-needed: clear the mmproj path, mark sidecar
      // complete (from the finalizer's perspective) so tryFinalize() can
      // proceed when the main GGUF finishes. Surface the failure to the
      // store so UI shows a "vision broken / repair needed" affordance.
      logger.warn('[ModelManager] mmproj failed, continuing as text-only:', event.reason);
      ctx.mmProjLocalPath = null;
      ctx.mmProjCompleted = true;
      // Update the sidecar status in the store before tryFinalize completes
      // and removes the entry; setStatus on a sidecar id only marks
      // mmProjStatus, not the main status (see downloadStore.setStatus).
      if (ctx.mmProjDownloadId) {
        useDownloadStore.getState().setStatus(ctx.mmProjDownloadId, 'failed', {
          message: event.reason || 'Vision projection download failed',
          code: event.reasonCode,
        });
      }
      removeMmProjComplete?.();
      removeMmProjError?.();
      tryFinalize().catch(() => {});
    });
  }

  tryFinalize().catch(() => {});
}

export { loadDownloadedModels, saveModelsList };
