import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { DownloadedModel, ModelFile, BackgroundDownloadInfo } from '../../types';
import { huggingFaceService } from '../huggingface';
import { backgroundDownloadService } from '../backgroundDownloadService';
import {
  DownloadProgressCallback,
  DownloadCompleteCallback,
  DownloadErrorCallback,
  BackgroundDownloadMetadataCallback,
  BackgroundDownloadContext,
} from './types';
import {
  buildDownloadedModel,
  persistDownloadedModel,
  loadDownloadedModels,
  saveModelsList,
} from './storage';
import logger from '../../utils/logger';
import {
  downloadMainFile,
  downloadMmProjFile,
  downloadMmProjBackground,
} from './downloadHelpers';

export {
  getOrphanedTextFiles,
  getOrphanedImageDirs,
} from './downloadHelpers';

type DownloadJob = { jobId: number; cancel: () => void };

export interface PerformDownloadOpts {
  modelId: string;
  file: ModelFile;
  modelsDir: string;
  downloadJobs: Map<string, DownloadJob>;
  onProgress?: DownloadProgressCallback;
}

export async function performDownloadModel(opts: PerformDownloadOpts): Promise<DownloadedModel> {
  const { modelId, file, modelsDir, downloadJobs, onProgress } = opts;
  const downloadKey = `${modelId}/${file.name}`;
  const localPath = `${modelsDir}/${file.name}`;
  const mmProjLocalPath = file.mmProjFile ? `${modelsDir}/${file.mmProjFile.name}` : null;
  const totalSize = file.size + (file.mmProjFile?.size || 0);

  const mainExists = await RNFS.exists(localPath);
  const mmProjExists = mmProjLocalPath ? await RNFS.exists(mmProjLocalPath) : true;

  if (mainExists && mmProjExists) {
    const model = await buildDownloadedModel({ modelId, file, resolvedLocalPath: localPath, mmProjPath: mmProjLocalPath || undefined });
    await persistDownloadedModel(model, modelsDir);
    return model;
  }

  if (!mainExists) {
    const downloadUrl = huggingFaceService.getDownloadUrl(modelId, file.name);
    await downloadMainFile({ downloadKey, downloadUrl, localPath, modelId, file, totalSize, downloadJobs, onProgress, initialMmProjBytes: 0 });
  }

  if (file.mmProjFile && mmProjLocalPath && !mmProjExists) {
    await downloadMmProjFile({
      mmProjDownloadKey: `${modelId}/${file.mmProjFile.name}`,
      mmProjFile: file.mmProjFile,
      mmProjLocalPath,
      modelId,
      totalSize,
      mainBytes: file.size,
      downloadJobs,
      onProgress,
    });
  }

  downloadJobs.delete(downloadKey);

  const mmProjFileExists = mmProjLocalPath ? await RNFS.exists(mmProjLocalPath) : false;
  const finalMmProjPath = mmProjLocalPath && mmProjFileExists ? mmProjLocalPath : undefined;

  const model = await buildDownloadedModel({ modelId, file, resolvedLocalPath: localPath, mmProjPath: finalMmProjPath });
  await persistDownloadedModel(model, modelsDir);
  return model;
}

export interface PerformBackgroundDownloadOpts {
  modelId: string;
  file: ModelFile;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

export async function performBackgroundDownload(opts: PerformBackgroundDownloadOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;
  const localPath = `${modelsDir}/${file.name}`;
  const mmProjLocalPath = file.mmProjFile ? `${modelsDir}/${file.mmProjFile.name}` : null;

  const mainExists = await RNFS.exists(localPath);
  const mmProjExists = mmProjLocalPath ? await RNFS.exists(mmProjLocalPath) : true;

  if (mainExists && mmProjExists) {
    return handleAlreadyDownloaded({ modelId, file, localPath, mmProjLocalPath, backgroundDownloadContext });
  }

  const mmProjSize = file.mmProjFile?.size || 0;
  const combinedTotalBytes = file.size + mmProjSize;
  let mmProjDownloaded = mmProjExists ? mmProjSize : 0;

  if (file.mmProjFile && mmProjLocalPath && !mmProjExists) {
    try {
      if (Platform.OS === 'android') {
        // Use Android DownloadManager so mmproj survives app backgrounding.
        // Pass silent=true so no separate notification appears for this dependency file.
        await backgroundDownloadService.downloadFileTo(
          {
            url: file.mmProjFile.downloadUrl,
            fileName: file.mmProjFile.name,
            modelId,
            totalBytes: file.mmProjFile.size,
          },
          mmProjLocalPath,
          (bytesDownloaded) => {
            onProgress?.({
              modelId,
              fileName: `${file.mmProjFile!.name} (vision)`,
              bytesDownloaded,
              totalBytes: combinedTotalBytes,
              progress: combinedTotalBytes > 0 ? bytesDownloaded / combinedTotalBytes : 0,
            });
          },
          true, // silent — suppress notification for dependency file
        );
        mmProjDownloaded = file.mmProjFile.size;
      } else {
        mmProjDownloaded = await downloadMmProjBackground({ file, mmProjLocalPath, modelId, combinedTotalBytes, onProgress });
      }
    } catch (e) {
      logger.warn('[ModelManager] mmproj download failed, vision will not be available:', e);
      // Continue — the GGUF download will still proceed; user just won't have vision support
    }
  }

  return startBgDownload({ modelId, file, localPath, mmProjLocalPath, combinedTotalBytes, mmProjDownloaded, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress });
}

interface AlreadyDownloadedOpts {
  modelId: string;
  file: ModelFile;
  localPath: string;
  mmProjLocalPath: string | null;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
}

async function handleAlreadyDownloaded(opts: AlreadyDownloadedOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, localPath, mmProjLocalPath, backgroundDownloadContext } = opts;
  const model = await buildDownloadedModel({ modelId, file, resolvedLocalPath: localPath, mmProjPath: mmProjLocalPath || undefined });
  const totalBytes = file.size + (file.mmProjFile?.size || 0);
  const completedInfo: BackgroundDownloadInfo = {
    downloadId: -1,
    fileName: file.name,
    modelId,
    status: 'completed',
    bytesDownloaded: totalBytes,
    totalBytes,
    startedAt: Date.now(),
    completedAt: Date.now(),
  };
  backgroundDownloadContext.set(-1, { model, error: null });
  return completedInfo;
}

interface StartBgDownloadOpts {
  modelId: string;
  file: ModelFile;
  localPath: string;
  mmProjLocalPath: string | null;
  combinedTotalBytes: number;
  mmProjDownloaded: number;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

async function startBgDownload(opts: StartBgDownloadOpts): Promise<BackgroundDownloadInfo> {
  const { modelId, file, localPath, mmProjLocalPath, combinedTotalBytes, mmProjDownloaded, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;
  const downloadUrl = huggingFaceService.getDownloadUrl(modelId, file.name);
  const author = modelId.split('/')[0] || 'Unknown';

  const downloadInfo = await backgroundDownloadService.startDownload({
    url: downloadUrl,
    fileName: file.name,
    modelId,
    title: `Downloading ${file.name}`,
    description: `${modelId} - ${file.quantization}`,
    totalBytes: file.size,
  });

  backgroundDownloadMetadataCallback?.(downloadInfo.downloadId, {
    modelId,
    fileName: file.name,
    quantization: file.quantization,
    author,
    totalBytes: combinedTotalBytes,
    mmProjFileName: file.mmProjFile?.name,
    mmProjLocalPath,
  });

  const capturedMmProjDownloaded = mmProjDownloaded;
  const removeProgressListener = backgroundDownloadService.onProgress(
    downloadInfo.downloadId,
    (event) => {
      const combinedDownloaded = capturedMmProjDownloaded + event.bytesDownloaded;
      onProgress?.({
        modelId,
        fileName: file.name,
        bytesDownloaded: combinedDownloaded,
        totalBytes: combinedTotalBytes,
        progress: combinedTotalBytes > 0 ? combinedDownloaded / combinedTotalBytes : 0,
      });
    },
  );

  backgroundDownloadContext.set(downloadInfo.downloadId, {
    modelId,
    file,
    localPath,
    mmProjLocalPath,
    removeProgressListener,
  });

  backgroundDownloadService.startProgressPolling();
  return downloadInfo;
}

export interface WatchDownloadOpts {
  downloadId: number;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onComplete?: DownloadCompleteCallback;
  onError?: DownloadErrorCallback;
}

export function watchBackgroundDownload(opts: WatchDownloadOpts): void {
  const { downloadId, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onComplete, onError } = opts;
  const ctx = backgroundDownloadContext.get(downloadId);

  if (downloadId === -1 && ctx && 'model' in ctx) {
    if (ctx.model) onComplete?.(ctx.model);
    else if (ctx.error) onError?.(ctx.error);
    backgroundDownloadContext.delete(downloadId);
    return;
  }

  if (!ctx || !('file' in ctx)) return;
  const { modelId, file, localPath, mmProjLocalPath, removeProgressListener } = ctx;

  const removeCompleteListener = backgroundDownloadService.onComplete(
    downloadId,
    async (event) => {
      removeProgressListener();
      removeCompleteListener();
      removeErrorListener();
      backgroundDownloadContext.delete(downloadId);

      try {
        const finalPath = await backgroundDownloadService.moveCompletedDownload(event.downloadId, localPath);
        const mmProjFileExists = mmProjLocalPath ? await RNFS.exists(mmProjLocalPath) : false;
        const finalMmProjPath = mmProjLocalPath && mmProjFileExists ? mmProjLocalPath : undefined;

        const model = await buildDownloadedModel({ modelId, file, resolvedLocalPath: finalPath, mmProjPath: finalMmProjPath });
        await persistDownloadedModel(model, modelsDir);
        backgroundDownloadMetadataCallback?.(event.downloadId, null);
        onComplete?.(model);
      } catch (error) {
        onError?.(error as Error);
      }
    },
  );

  const removeErrorListener = backgroundDownloadService.onError(
    downloadId,
    (event) => {
      removeProgressListener();
      removeCompleteListener();
      removeErrorListener();
      backgroundDownloadContext.delete(downloadId);
      backgroundDownloadMetadataCallback?.(event.downloadId, null);
      onError?.(new Error(event.reason || 'Download failed'));
    },
  );
}

export interface SyncDownloadsOpts {
  persistedDownloads: Record<number, {
    modelId: string;
    fileName: string;
    quantization: string;
    author: string;
    totalBytes: number;
  }>;
  modelsDir: string;
  clearDownloadCallback: (downloadId: number) => void;
}

export async function syncCompletedBackgroundDownloads(opts: SyncDownloadsOpts): Promise<DownloadedModel[]> {
  const { persistedDownloads, modelsDir, clearDownloadCallback } = opts;
  const completedModels: DownloadedModel[] = [];
  const activeDownloads = await backgroundDownloadService.getActiveDownloads();

  for (const download of activeDownloads) {
    const metadata = persistedDownloads[download.downloadId];
    if (!metadata) continue;

    if (download.status === 'completed') {
      try {
        const localPath = `${modelsDir}/${metadata.fileName}`;
        await backgroundDownloadService.moveCompletedDownload(download.downloadId, localPath);

        const fileInfo: ModelFile = {
          name: metadata.fileName,
          size: metadata.totalBytes,
          quantization: metadata.quantization,
          downloadUrl: '',
        };

        const model = await buildDownloadedModel({ modelId: metadata.modelId, file: fileInfo, resolvedLocalPath: localPath });
        await persistDownloadedModel(model, modelsDir);
        completedModels.push(model);
        clearDownloadCallback(download.downloadId);
      } catch {
        // Skip failed syncs
      }
    } else if (download.status === 'failed') {
      clearDownloadCallback(download.downloadId);
    }
  }

  return completedModels;
}

export interface RestoreDownloadsOpts {
  persistedDownloads: Record<number, {
    modelId: string;
    fileName: string;
    quantization: string;
    author: string;
    totalBytes: number;
    mmProjFileName?: string;
    mmProjLocalPath?: string | null;
  }>;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

/**
 * Re-wires backgroundDownloadContext for downloads that were running when the
 * app was killed. Called on app startup after syncCompletedBackgroundDownloads
 * so that any still-running download fires onComplete/onError correctly.
 */
export async function restoreInProgressDownloads(opts: RestoreDownloadsOpts): Promise<void> {
  const { persistedDownloads, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;

  if (!backgroundDownloadService.isAvailable()) return;

  const activeDownloads = await backgroundDownloadService.getActiveDownloads();

  for (const download of activeDownloads) {
    if (download.status !== 'running' && download.status !== 'pending' && download.status !== 'paused') continue;

    const metadata = persistedDownloads[download.downloadId];
    if (!metadata) continue;

    // Skip if context is already set (e.g., this download was started in the same session)
    if (backgroundDownloadContext.has(download.downloadId)) continue;

    const localPath = `${modelsDir}/${metadata.fileName}`;
    const mmProjLocalPath = metadata.mmProjLocalPath ?? null;
    const combinedTotalBytes = metadata.totalBytes;

    const fileInfo: ModelFile = {
      name: metadata.fileName,
      size: metadata.totalBytes,
      quantization: metadata.quantization,
      downloadUrl: '',
      mmProjFile: metadata.mmProjFileName
        ? { name: metadata.mmProjFileName, downloadUrl: '', size: 0 }
        : undefined,
    };

    const removeProgressListener = backgroundDownloadService.onProgress(
      download.downloadId,
      (event) => {
        onProgress?.({
          modelId: metadata.modelId,
          fileName: metadata.fileName,
          bytesDownloaded: event.bytesDownloaded,
          totalBytes: combinedTotalBytes,
          progress: combinedTotalBytes > 0 ? event.bytesDownloaded / combinedTotalBytes : 0,
        });
      },
    );

    backgroundDownloadContext.set(download.downloadId, {
      modelId: metadata.modelId,
      file: fileInfo,
      localPath,
      mmProjLocalPath,
      removeProgressListener,
    });

    backgroundDownloadMetadataCallback?.(download.downloadId, {
      modelId: metadata.modelId,
      fileName: metadata.fileName,
      quantization: metadata.quantization,
      author: metadata.author,
      totalBytes: combinedTotalBytes,
      mmProjFileName: metadata.mmProjFileName,
      mmProjLocalPath,
    });
  }
}

export { loadDownloadedModels, saveModelsList };
