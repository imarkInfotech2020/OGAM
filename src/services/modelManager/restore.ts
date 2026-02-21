import { PersistedDownloadInfo, ModelFile } from '../../types';
import { backgroundDownloadService } from '../backgroundDownloadService';
import {
  BackgroundDownloadContext,
  BackgroundDownloadMetadataCallback,
  DownloadProgressCallback,
} from './types';

export interface RestoreDownloadsOpts {
  persistedDownloads: Record<number, PersistedDownloadInfo>;
  modelsDir: string;
  backgroundDownloadContext: Map<number, BackgroundDownloadContext>;
  backgroundDownloadMetadataCallback: BackgroundDownloadMetadataCallback | null;
  onProgress?: DownloadProgressCallback;
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
    if (download.status !== 'running' && download.status !== 'pending' && download.status !== 'paused') continue;

    const metadata = persistedDownloads[download.downloadId];
    if (!metadata) continue;

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
      ...metadata,
      mmProjLocalPath,
    });
  }
}
