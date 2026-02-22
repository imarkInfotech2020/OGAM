import RNFS from 'react-native-fs';
import { PersistedDownloadInfo, ModelFile, BackgroundDownloadInfo } from '../../types';
import { backgroundDownloadService } from '../backgroundDownloadService';
import {
  BackgroundDownloadContext,
  BackgroundDownloadMetadataCallback,
  DownloadProgressCallback,
} from './types';
import logger from '../../utils/logger';

export interface RestoreDownloadsOpts {
  persistedDownloads: Record<number, PersistedDownloadInfo>;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

/** Check whether an active download is eligible for restoration. */
function isRestorable(download: BackgroundDownloadInfo): boolean {
  return download.status === 'running' || download.status === 'pending' || download.status === 'paused';
}

/** Determine the mmproj completion state from active downloads after app kill. */
async function resolveMmProjState(
  mmProjDownloadId: number,
  mmProjLocalPath: string | null,
  activeDownloads: BackgroundDownloadInfo[],
): Promise<boolean> {
  const mmProjDownload = activeDownloads.find(d => d.downloadId === mmProjDownloadId);

  if (mmProjDownload?.status === 'failed') {
    logger.warn('[ModelManager] mmproj download failed while app was dead, vision will not be available');
    return true; // Treat as done — model will work without vision
  }

  if (!mmProjDownload || mmProjDownload.status === 'completed') {
    // mmproj finished while app was dead — move it if needed
    if (mmProjDownload && mmProjLocalPath) {
      try { await backgroundDownloadService.moveCompletedDownload(mmProjDownloadId, mmProjLocalPath); }
      catch { /* May already be moved */ }
    }
    if (!mmProjLocalPath || !(await RNFS.exists(mmProjLocalPath))) {
      logger.warn('[ModelManager] mmproj download completed but file not found, vision will not be available');
    }
    return true;
  }

  // Still running
  return false;
}

/** Build a ModelFile from persisted metadata. */
function buildFileInfo(metadata: PersistedDownloadInfo): ModelFile {
  return {
    name: metadata.fileName,
    size: metadata.totalBytes,
    quantization: metadata.quantization,
    downloadUrl: '',
    mmProjFile: metadata.mmProjFileName
      ? { name: metadata.mmProjFileName, downloadUrl: '', size: 0 }
      : undefined,
  };
}

/**
 * Re-wires backgroundDownloadContext for downloads that were still running
 * when the app was killed. Called on startup after syncCompletedBackgroundDownloads
 * so that any still-running download fires onComplete/onError correctly.
 */
export async function restoreInProgressDownloads(opts: RestoreDownloadsOpts): Promise<void> {
  const { persistedDownloads, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;

  if (!backgroundDownloadService.isAvailable()) return;

  const activeDownloads = await backgroundDownloadService.getActiveDownloads();

  for (const download of activeDownloads) {
    if (!isRestorable(download)) continue;
    const metadata = persistedDownloads[download.downloadId];
    if (!metadata || backgroundDownloadContext.has(download.downloadId)) continue;

    const localPath = `${modelsDir}/${metadata.fileName}`;
    const mmProjLocalPath = metadata.mmProjLocalPath ?? null;
    const combinedTotalBytes = metadata.totalBytes;
    const mmProjDownloadId = metadata.mmProjDownloadId;
    const fileInfo = buildFileInfo(metadata);

    // Determine mmproj state
    let mmProjCompleted = !mmProjDownloadId;
    if (mmProjDownloadId) {
      mmProjCompleted = await resolveMmProjState(mmProjDownloadId, mmProjLocalPath, activeDownloads);
    }

    // Combined progress tracking
    let mainBytesDownloaded = 0;
    let mmProjBytesDownloaded = mmProjCompleted ? (fileInfo.mmProjFile?.size || 0) : 0;
    const reportProgress = () => {
      const combinedDownloaded = mainBytesDownloaded + mmProjBytesDownloaded;
      onProgress?.({
        modelId: metadata.modelId, fileName: metadata.fileName,
        bytesDownloaded: combinedDownloaded, totalBytes: combinedTotalBytes,
        progress: combinedTotalBytes > 0 ? combinedDownloaded / combinedTotalBytes : 0,
      });
    };

    const removeProgressListener = backgroundDownloadService.onProgress(
      download.downloadId, (event) => { mainBytesDownloaded = event.bytesDownloaded; reportProgress(); },
    );

    let removeMmProjProgressListener: (() => void) | undefined;
    if (mmProjDownloadId && !mmProjCompleted) {
      backgroundDownloadService.markSilent(mmProjDownloadId);
      removeMmProjProgressListener = backgroundDownloadService.onProgress(
        mmProjDownloadId, (event) => { mmProjBytesDownloaded = event.bytesDownloaded; reportProgress(); },
      );
    }

    backgroundDownloadContext.set(download.downloadId, {
      modelId: metadata.modelId, file: fileInfo, localPath, mmProjLocalPath,
      removeProgressListener, mmProjDownloadId, mmProjCompleted, mainCompleted: false,
      removeMmProjProgressListener,
    });

    backgroundDownloadMetadataCallback?.(download.downloadId, { ...metadata, mmProjLocalPath });
  }
}
