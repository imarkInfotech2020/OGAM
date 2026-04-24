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
  persistedDownloads: Record<string, PersistedDownloadInfo>;
  modelsDir: string;
  backgroundDownloadContext: Map<string, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

function isRestorable(download: BackgroundDownloadInfo): boolean {
  return download.status === 'running' || download.status === 'pending';
}

async function resolveMmProjState(
  mmProjDownloadId: string,
  mmProjLocalPath: string | null,
  activeDownloads: BackgroundDownloadInfo[],
): Promise<boolean> {
  const mmProjDownload = activeDownloads.find(d => d.downloadId === mmProjDownloadId);

  if (mmProjDownload?.status === 'failed') {
    logger.warn('[ModelManager] mmproj download failed while app was dead, vision will not be available');
    return true;
  }

  if (!mmProjDownload || mmProjDownload.status === 'completed') {
    if (mmProjDownload && mmProjLocalPath) {
      try { await backgroundDownloadService.moveCompletedDownload(mmProjDownloadId, mmProjLocalPath); }
      catch { /* May already be moved */ }
    }
    if (!mmProjLocalPath || !(await RNFS.exists(mmProjLocalPath))) {
      logger.warn('[ModelManager] mmproj download completed but file not found, vision will not be available');
    }
    return true;
  }

  return false;
}

function buildFileInfo(metadata: PersistedDownloadInfo): ModelFile {
  const mainFileSize = metadata.mainFileSize ?? metadata.totalBytes;
  const mmProjFileSize = metadata.mmProjFileSize ?? 0;
  return {
    name: metadata.fileName,
    size: mainFileSize,
    quantization: metadata.quantization,
    downloadUrl: '',
    mmProjFile: metadata.mmProjFileName
      ? { name: metadata.mmProjFileName, downloadUrl: '', size: mmProjFileSize }
      : undefined,
  };
}

interface RestoreEntryOpts {
  download: BackgroundDownloadInfo;
  metadata: PersistedDownloadInfo;
  modelsDir: string;
  activeDownloads: BackgroundDownloadInfo[];
  backgroundDownloadContext: Map<string, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
}

async function restoreDownloadEntry(opts: RestoreEntryOpts): Promise<void> {
  const {
    download, metadata, modelsDir, activeDownloads,
    backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress,
  } = opts;

  const localPath = `${modelsDir}/${metadata.fileName}`;
  const mmProjLocalPath = metadata.mmProjLocalPath ?? null;
  const mainFileSize = metadata.mainFileSize ?? metadata.totalBytes;
  const mmProjFileSize = metadata.mmProjFileSize ?? 0;
  const combinedTotalBytes = metadata.totalBytes > 0
    ? metadata.totalBytes
    : mainFileSize + mmProjFileSize;
  const mmProjDownloadId = metadata.mmProjDownloadId;
  const fileInfo = buildFileInfo(metadata);

  let mmProjCompleted = !mmProjDownloadId;
  if (mmProjDownloadId) {
    mmProjCompleted = await resolveMmProjState(mmProjDownloadId, mmProjLocalPath, activeDownloads);
  }

  const mmProjDownload = mmProjDownloadId
    ? activeDownloads.find(d => d.downloadId === mmProjDownloadId)
    : undefined;
  let mainBytesDownloaded = download.bytesDownloaded;
  let mmProjBytesDownloaded = mmProjCompleted
    ? mmProjFileSize
    : (mmProjDownload?.bytesDownloaded || 0);

  const reportProgress = () => {
    const combinedDownloaded = mainBytesDownloaded + mmProjBytesDownloaded;
    onProgress?.({
      downloadId: download.downloadId,
      modelId: metadata.modelId, fileName: metadata.fileName,
      bytesDownloaded: combinedDownloaded, totalBytes: combinedTotalBytes,
      progress: combinedTotalBytes > 0 ? combinedDownloaded / combinedTotalBytes : 0,
    });
  };

  const removeProgressListener = backgroundDownloadService.onProgress(
    download.downloadId, (event) => {
      mainBytesDownloaded = event.bytesDownloaded; reportProgress();
    },
  );

  let removeMmProjProgressListener: (() => void) | undefined;
  if (mmProjDownloadId && !mmProjCompleted) {
    removeMmProjProgressListener = backgroundDownloadService.onProgress(
      mmProjDownloadId, (event) => {
        mmProjBytesDownloaded = event.bytesDownloaded; reportProgress();
      },
    );
  }

  backgroundDownloadContext.set(download.downloadId, {
    modelId: metadata.modelId, file: fileInfo, localPath, mmProjLocalPath,
    removeProgressListener, mmProjDownloadId, mmProjCompleted, mainCompleted: false,
    removeMmProjProgressListener,
  });
  backgroundDownloadMetadataCallback?.(download.downloadId, { ...metadata, mmProjLocalPath });
  reportProgress();
}

export async function restoreInProgressDownloads(opts: RestoreDownloadsOpts): Promise<string[]> {
  const { persistedDownloads, modelsDir, backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress } = opts;

  if (!backgroundDownloadService.isAvailable()) return [];

  const activeDownloads = await backgroundDownloadService.getActiveDownloads();
  const restoredDownloadIds: string[] = [];

  for (const download of activeDownloads) {
    if (!isRestorable(download)) continue;
    const metadata = persistedDownloads[download.downloadId];
    if (!metadata || backgroundDownloadContext.has(download.downloadId)) continue;
    if (metadata.modelId.startsWith('image:')) continue;
    await restoreDownloadEntry({
      download, metadata, modelsDir, activeDownloads,
      backgroundDownloadContext, backgroundDownloadMetadataCallback, onProgress,
    });
    restoredDownloadIds.push(download.downloadId);
  }

  return restoredDownloadIds;
}
