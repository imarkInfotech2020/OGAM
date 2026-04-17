/* eslint-disable max-lines, max-lines-per-function */
import { useState, useRef, useEffect, useCallback } from 'react';
import { AlertState, showAlert, hideAlert, initialAlertState } from '../../components/CustomAlert';
import { useAppStore } from '../../stores';
import {
  modelManager,
  backgroundDownloadService,
  activeModelService,
  hardwareService,
  huggingFaceService,
} from '../../services';
import { DownloadedModel, BackgroundDownloadInfo, ONNXImageModel } from '../../types';
import { DownloadItem, DownloadItemsData, buildDownloadItems, formatBytes } from './items';
import logger from '../../utils/logger';
import { getUserFacingDownloadMessage } from '../../utils/downloadErrors';

export interface UseDownloadManagerResult {
  isRefreshing: boolean;
  activeItems: DownloadItem[];
  completedItems: DownloadItem[];
  alertState: AlertState;
  setAlertState: (state: AlertState) => void;
  handleRefresh: () => Promise<void>;
  handleRemoveDownload: (item: DownloadItem) => void;
  handleRetryDownload: (item: DownloadItem) => void;
  handleDeleteItem: (item: DownloadItem) => void;
  handleRepairVision: (item: DownloadItem) => void;
  totalStorageUsed: number;
  stats: { eventsPerSec: number };
}

function formatBytesForLog(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex >= 2 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatProgressForLog(bytesDownloaded: number, totalBytes: number): string {
  if (totalBytes > 0) {
    const percent = Math.max(0, Math.min(100, (bytesDownloaded / totalBytes) * 100));
    return `${percent.toFixed(1)}% (${formatBytesForLog(bytesDownloaded)} / ${formatBytesForLog(totalBytes)})`;
  }
  return formatBytesForLog(bytesDownloaded);
}

function isNetworkRetryReason(reason?: string, reasonCode?: string): boolean {
  const normalized = (reason || '').toLowerCase();
  return (
    reasonCode === 'network_lost' ||
    normalized.includes('network connection lost') ||
    normalized.includes('waiting to resume') ||
    normalized.includes('network error')
  );
}

function isMmProjSidecar(metadata: { fileName: string; mmProjFileName?: string } | null | undefined): boolean {
  if (!metadata) return false;
  if (metadata.mmProjFileName && metadata.fileName === metadata.mmProjFileName) return true;
  return metadata.fileName.startsWith('mmproj-');
}

async function purgeStaleImageDownloads(downloads: BackgroundDownloadInfo[]): Promise<BackgroundDownloadInfo[]> {
  const { downloadedImageModels } = useAppStore.getState();
  const downloadedIds = new Set(downloadedImageModels.map(m => m.id));
  for (const d of downloads) {
    if (!d.modelId.startsWith('image:')) continue;
    if (downloadedIds.has(d.modelId.replace('image:', ''))) {
      backgroundDownloadService.moveCompletedDownload(d.downloadId, '').catch(() => {});
      backgroundDownloadService.cancelDownload(d.downloadId).catch(() => {});
    }
  }
  return downloads.filter(d =>
    (
      d.status === 'running' ||
      d.status === 'pending' ||
      d.status === 'paused' ||
      d.status === 'failed' ||
      d.status === 'retrying' ||
      d.status === 'waiting_for_network'
    ) &&
    !(d.modelId.startsWith('image:') && downloadedIds.has(d.modelId.replace('image:', ''))),
  );
}

function clearStaleTextProgressEntries(
  downloads: BackgroundDownloadInfo[],
  setDownloadProgress: (key: string, value: any) => void,
  logDownload: (level: 'log' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void,
): void {
  const state = useAppStore.getState();
  const activeDownloadIds = new Set(downloads.map(download => download.downloadId));
  const activeKeys = new Set<string>();

  downloads.forEach(download => {
    const metadata = state.activeBackgroundDownloads[download.downloadId];
    if (!metadata || isMmProjSidecar(metadata) || metadata.modelId.startsWith('image:')) return;
    activeKeys.add(`${metadata.modelId}/${metadata.fileName}`);
  });

  Object.entries(state.downloadProgress).forEach(([key, progress]) => {
    const modelId = key.slice(0, key.lastIndexOf('/'));
    if (modelId.startsWith('image:')) return;
    if (activeKeys.has(key)) return;
    if (progress.ownerDownloadId != null && activeDownloadIds.has(progress.ownerDownloadId)) return;

    logDownload('warn', 'clearing stale progress entry with no active native download', {
      key,
      ownerDownloadId: progress.ownerDownloadId ?? null,
      status: progress.status ?? '',
      bytesDownloaded: progress.bytesDownloaded,
      totalBytes: progress.totalBytes,
    });
    setDownloadProgress(key, null);
  });
}

function syncDownloadSnapshot(
  download: BackgroundDownloadInfo,
  setDownloadProgress: (key: string, value: any) => void,
): { modelId: string } | null {
  const metadata = useAppStore.getState().activeBackgroundDownloads[download.downloadId];
  if (!metadata) return null;
  if (isMmProjSidecar(metadata)) return null;

  const key = `${metadata.modelId}/${metadata.fileName}`;
  const existing = useAppStore.getState().downloadProgress[key];
  const totalBytes = metadata.totalBytes || download.totalBytes || existing?.totalBytes || 0;
  const sameDownloadInstance = existing?.ownerDownloadId === download.downloadId;
  const bytesDownloaded = sameDownloadInstance
    ? Math.max(existing?.bytesDownloaded ?? 0, download.bytesDownloaded)
    : download.bytesDownloaded;
  const shouldSyncProgress =
    !existing ||
    download.status !== (existing.status ?? 'downloading') ||
    download.reason !== existing.reason ||
    download.reasonCode !== existing.reasonCode ||
    download.bytesDownloaded !== existing.bytesDownloaded ||
    totalBytes !== existing.totalBytes;

  if (!shouldSyncProgress) {
    return { modelId: metadata.modelId };
  }

  const resolvedStatus = download.status === 'pending' && isNetworkRetryReason(download.reason, download.reasonCode)
    ? 'retrying'
    : download.status;
  setDownloadProgress(key, {
    progress: totalBytes > 0 ? bytesDownloaded / totalBytes : existing?.progress ?? 0,
    bytesDownloaded,
    totalBytes,
    ownerDownloadId: download.downloadId,
    status: resolvedStatus,
    reason: download.reason || existing?.reason,
    reasonCode: download.reasonCode || existing?.reasonCode,
  });
  return { modelId: metadata.modelId };
}

export function useDownloadManager(): UseDownloadManagerResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<BackgroundDownloadInfo[]>([]);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const cancelledKeysRef = useRef<Set<string>>(new Set());
  const {
    downloadedModels,
    setDownloadedModels,
    downloadProgress,
    setDownloadProgress,
    removeDownloadedModel,
    activeBackgroundDownloads,
    setBackgroundDownload,
    downloadedImageModels,
    setDownloadedImageModels,
    removeDownloadedImageModel,
    removeImageModelDownloading,
  } = useAppStore();
  const logDownload = useCallback((level: 'log' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    const payload = meta ? ` ${JSON.stringify(meta)}` : '';
    logger[level](`[DownloadManagerScreen] ${message}${payload}`);
  }, []);
  const retryLoggedRef = useRef<Record<string, string>>({});

  // ── Dev stats ──────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<{ eventsPerSec: number }>({ eventsPerSec: 0 });
  const eventCountRef = useRef(0);

  useEffect(() => {
    const unsub = backgroundDownloadService.onAnyProgress(() => { eventCountRef.current += 1; });
    const tick = setInterval(() => {
      setStats({ eventsPerSec: eventCountRef.current });
      eventCountRef.current = 0;
    }, 1000);
    return () => { unsub(); clearInterval(tick); };
  }, []);

  // Load active background downloads on mount + start/stop polling
  useEffect(() => {
    logDownload('log', 'Screen mounted. Loading active downloads.');
    loadActiveDownloads();

    if (backgroundDownloadService.isAvailable()) {
      modelManager.startBackgroundDownloadPolling();
      logDownload('log', 'Background polling started.');
    } else {
      logDownload('warn', 'Background download service unavailable on this device.');
    }
    // Do NOT stop polling on unmount — other screens (Models tab) rely on
    // the same native polling timer for progress events. Polling is cheap
    // (no-op when no active downloads) and stops automatically when all
    // downloads complete.
  }, [logDownload]);

  // Subscribe to background download service events
  useEffect(() => {
    if (!backgroundDownloadService.isAvailable()) return;

    // Broadcast progress for all downloads. Per-download listeners (useTextModels)
    // compute combined GGUF+mmproj progress and fire first. We skip the update here
    // if the store already has a higher bytesDownloaded (i.e. combined progress).
    const unsubProgress = backgroundDownloadService.onAnyProgress((event) => {
      const metadata = useAppStore.getState().activeBackgroundDownloads[event.downloadId];
      if (!metadata) return;
      if (isMmProjSidecar(metadata)) return;
      if (metadata.modelId.startsWith('image:')) return;
      const key = `${metadata.modelId}/${metadata.fileName}`;
      if (cancelledKeysRef.current.has(key)) return;
      if (event.status === 'retrying' || event.status === 'waiting_for_network') {
        const retryReason = event.reason || 'network issue';
        if (retryLoggedRef.current[event.downloadId] !== retryReason) {
          retryLoggedRef.current[event.downloadId] = retryReason;
          logDownload('warn', `${event.status === 'waiting_for_network' ? 'Waiting for network' : 'Retrying'} ${metadata.fileName} (${event.downloadId}): ${retryReason}`);
        }
        // Keep existing bytes — just update status and reason so the UI shows "Reconnecting..."
        const existing = useAppStore.getState().downloadProgress[key];
        setDownloadProgress(key, {
          progress: existing?.progress ?? 0,
          bytesDownloaded: existing?.bytesDownloaded ?? 0,
          totalBytes: existing?.totalBytes ?? 0,
          ownerDownloadId: event.downloadId,
          status: event.status,
          reason: event.reason,
          reasonCode: event.reasonCode,
        });
        // Also update activeDownloads so buildDownloadItems reflects the new status immediately
        // without waiting for the next loadActiveDownloads() call.
        setActiveDownloads(prev => prev.map(d =>
          d.downloadId === event.downloadId
            ? { ...d, status: event.status, reason: event.reason, reasonCode: event.reasonCode as any }
            : d,
        ));
        return;
      }
      const existing = useAppStore.getState().downloadProgress[key];
      if ((existing?.ownerDownloadId === event.downloadId) && (existing.bytesDownloaded >= event.bytesDownloaded)) return;
      setDownloadProgress(key, {
        progress: event.totalBytes > 0 ? event.bytesDownloaded / event.totalBytes : 0,
        bytesDownloaded: event.bytesDownloaded,
        totalBytes: event.totalBytes,
        ownerDownloadId: event.downloadId,
        status: event.status,
        reason: event.reason || undefined,
        reasonCode: event.reasonCode,
      });
      logDownload(
        'log',
        `Progress ${metadata.fileName} (${event.downloadId}): ${formatProgressForLog(event.bytesDownloaded, event.totalBytes)}${event.reason ? ` · ${event.reason}` : ''}`,
      );
    });

    const unsubComplete = backgroundDownloadService.onAnyComplete(async (_event) => {
      logDownload('log', `Download completed: ${_event.downloadId}`);
      delete retryLoggedRef.current[_event.downloadId];
      await loadActiveDownloads();
    });

    const unsubError = backgroundDownloadService.onAnyError(async (event) => {
      logDownload('error', `Download failed (${event.downloadId}): ${event.reason || 'Something went wrong while downloading.'}`);
      delete retryLoggedRef.current[event.downloadId];
      const metadata = useAppStore.getState().activeBackgroundDownloads[event.downloadId];
      if (metadata) {
        if (isMmProjSidecar(metadata)) return;
        const key = `${metadata.modelId}/${metadata.fileName}`;
        const existing = useAppStore.getState().downloadProgress[key];
        setDownloadProgress(key, {
          progress: existing?.progress ?? 0,
          bytesDownloaded: existing?.bytesDownloaded ?? 0,
          totalBytes: existing?.totalBytes ?? metadata.totalBytes ?? 0,
          ownerDownloadId: event.downloadId,
          status: 'failed',
          reason: event.reason || 'Something went wrong while downloading.',
          reasonCode: event.reasonCode,
        });
      }
      setAlertState(showAlert('Download Failed', getUserFacingDownloadMessage(event.reason, event.reasonCode)));
      await loadActiveDownloads();
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };

  }, [setDownloadProgress, logDownload]);

  const loadActiveDownloads = async () => {
    if (backgroundDownloadService.isAvailable()) {
      const downloads = await modelManager.getActiveBackgroundDownloads();
      const filteredDownloads = await purgeStaleImageDownloads(downloads);
      clearStaleTextProgressEntries(filteredDownloads, setDownloadProgress, logDownload);
      setActiveDownloads(filteredDownloads);
      logDownload('log', `Active downloads refreshed: ${filteredDownloads.length}`);
      filteredDownloads.forEach(download => {
        const snapshot = syncDownloadSnapshot(download, setDownloadProgress);
        logDownload(
          'log',
          `Download snapshot ${download.downloadId}: ${download.status} ${formatProgressForLog(download.bytesDownloaded, download.totalBytes)} model=${snapshot?.modelId || download.modelId}${download.reason ? ` · ${download.reason}` : ''}`,
        );
      });
    }
  };
  const handleRefresh = useCallback(async () => {
    logDownload('log', 'Manual refresh requested.');
    setIsRefreshing(true);
    await loadActiveDownloads();
    const models = await modelManager.getDownloadedModels();
    setDownloadedModels(models);
    const imageModels = await modelManager.getDownloadedImageModels();
    setDownloadedImageModels(imageModels);
    logDownload('log', `Refresh complete. Downloaded models: ${models.length}, image models: ${imageModels.length}`);
    setIsRefreshing(false);

  }, [setDownloadedModels, setDownloadedImageModels, logDownload]);

  const executeRemoveDownload = async (item: DownloadItem) => {
    setAlertState(hideAlert());
    try {
      logDownload('warn', `Removing download: ${item.fileName}`);
      const key = `${item.modelId}/${item.fileName}`;
      logDownload('warn', 'remove requested', {
        modelId: item.modelId,
        fileName: item.fileName,
        itemDownloadId: item.downloadId ?? null,
        existingProgress: useAppStore.getState().downloadProgress[key] ?? null,
      });
      cancelledKeysRef.current.add(key);
      setDownloadProgress(key, null);
      let downloadId = item.downloadId;
      if (!downloadId) {
        const match = activeDownloads.find(d => {
          const metadata = activeBackgroundDownloads[d.downloadId];
          return metadata?.modelId === item.modelId && metadata?.fileName === item.fileName;
        });
        if (match) downloadId = match.downloadId;
      }
      if (downloadId) {
        logDownload('warn', 'cancelling concrete download', {
          key,
          downloadId,
          metadata: activeBackgroundDownloads[downloadId] ?? null,
        });
        setActiveDownloads(prev => prev.filter(d => d.downloadId !== downloadId));
        setBackgroundDownload(downloadId, null);
        await modelManager.cancelBackgroundDownload(downloadId);
        logDownload('log', 'cancel completed', { key, downloadId });
      } else {
        logDownload('warn', 'remove requested but no concrete downloadId found', { key, item });
      }
      if (item.modelId.startsWith('image:')) removeImageModelDownloading(item.modelId.replace('image:', ''));
      const capturedKey = key;
      // Reload after a delay to let the native cancel write reach the DB.
      // Keep the key blocked in cancelledKeysRef until AFTER reload so that
      // any in-flight progress events from the dying worker don't resurrect the item.
      setTimeout(() => {
        loadActiveDownloads()
          .catch(err => logger.error('[DownloadManager] Failed to reload active downloads:', err))
          .finally(() => {
            logDownload('log', 'post-cancel reload finished', {
              key: capturedKey,
              activeCount: activeDownloads.length,
              persistedProgress: useAppStore.getState().downloadProgress[capturedKey] ?? null,
            });
            cancelledKeysRef.current.delete(capturedKey);
          });
      }, 2500);
    } catch (error) {
      logger.error('[DownloadManager] Failed to remove download:', error);
      logDownload('error', `Failed to remove download ${item.fileName}`);
      setAlertState(showAlert('Error', 'Failed to remove download'));
    }
  };

  const handleRemoveDownload = (item: DownloadItem) => {
    setAlertState(
      showAlert(
        'Remove Download',
        'Are you sure you want to remove this download?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: () => { executeRemoveDownload(item); },
          },
        ],
      ),
    );
  };

  const executeRetryDownload = async (item: DownloadItem) => {
    setAlertState(hideAlert());
    try {
      logDownload('log', 'retry requested', {
        modelId: item.modelId,
        fileName: item.fileName,
        itemDownloadId: item.downloadId ?? null,
      });
      const key = `${item.modelId}/${item.fileName}`;

      // Look up metadata
      const metadata = item.downloadId ? activeBackgroundDownloads[item.downloadId] : undefined;

      if (!metadata) {
        logDownload('error', `Could not find metadata for retry: ${item.fileName}`);
        setAlertState(showAlert('Error', 'Could not retry download - metadata not found'));
        return;
      }

      // Clean up old state
      const oldDownloadId = item.downloadId;
      if (oldDownloadId) {
        setBackgroundDownload(oldDownloadId, null);
        cancelledKeysRef.current.add(key);
      }
      setDownloadProgress(key, null);

      // Set fresh progress
      setDownloadProgress(key, { progress: 0, bytesDownloaded: 0, totalBytes: metadata.totalBytes });

      // Build ModelFile from metadata
      const downloadUrl = huggingFaceService.getDownloadUrl(metadata.modelId, metadata.fileName);
      const modelFile = {
        name: metadata.fileName,
        size: metadata.mainFileSize ?? metadata.totalBytes,
        quantization: metadata.quantization,
        downloadUrl,
      };

      // Start retry download
      const info = await modelManager.downloadModelBackground(metadata.modelId, modelFile as any);
      logDownload('log', 'retry started', {
        key,
        oldDownloadId: oldDownloadId ?? null,
        newDownloadId: info.downloadId,
        metadata,
      });

      modelManager.watchDownload(
        info.downloadId,
        async () => {
          logDownload('log', `Retry completed for ${item.fileName}`);
          setDownloadProgress(key, null);
          if (oldDownloadId) {
            cancelledKeysRef.current.delete(key);
          }
          const models = await modelManager.getDownloadedModels();
          setDownloadedModels(models);
          setAlertState(showAlert('Download Complete', `${item.fileName} downloaded successfully`));
        },
        (error) => {
          logDownload('error', `Retry failed for ${item.fileName}: ${error.message}`);
          setDownloadProgress(key, {
            progress: (downloadProgress[key]?.progress ?? 0),
            bytesDownloaded: (downloadProgress[key]?.bytesDownloaded ?? 0),
            totalBytes: metadata.totalBytes,
            status: 'failed',
            reason: error.message,
          });
        },
      );
    } catch (error) {
      logger.error('[DownloadManager] Failed to retry download:', error);
      logDownload('error', `Retry failed for ${item.fileName}: ${error}`);
      setAlertState(showAlert('Error', 'Failed to retry download'));
    }
  };

  const handleRetryDownload = (item: DownloadItem) => {
    setAlertState(
      showAlert(
        'Retry Download',
        'This will restart the download from the beginning. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Retry',
            style: 'default',
            onPress: () => { executeRetryDownload(item); },
          },
        ],
      ),
    );
  };

  const executeDeleteModel = async (model: DownloadedModel) => {
    setAlertState(hideAlert());
    try {
      logDownload('warn', `Deleting downloaded model: ${model.fileName}`);
      await modelManager.deleteModel(model.id);
      removeDownloadedModel(model.id);
      logDownload('log', `Deleted model: ${model.fileName}`);
    } catch (error) {
      logger.error('[DownloadManager] Failed to delete model:', error);
      logDownload('error', `Failed to delete model: ${model.fileName}`);
      setAlertState(showAlert('Error', 'Failed to delete model'));
    }
  };
  const handleDeleteModel = (model: DownloadedModel) => {
    const totalSize = hardwareService.getModelTotalSize(model);
    setAlertState(
      showAlert(
        'Delete Model',
        `Are you sure you want to delete "${model.fileName}"? This will free up ${formatBytes(totalSize)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => { executeDeleteModel(model); },
          },
        ],
      ),
    );
  };

  const executeDeleteImageModel = async (model: ONNXImageModel) => {
    setAlertState(hideAlert());
    try {
      logDownload('warn', `Deleting image model: ${model.name}`);
      await activeModelService.unloadImageModel();
      await modelManager.deleteImageModel(model.id);
      removeDownloadedImageModel(model.id);
      logDownload('log', `Deleted image model: ${model.name}`);
    } catch (error) {
      logger.error('[DownloadManager] Failed to delete image model:', error);
      logDownload('error', `Failed to delete image model: ${model.name}`);
      setAlertState(showAlert('Error', 'Failed to delete image model'));
    }
  };
  const handleDeleteImageModel = (model: ONNXImageModel) => {
    setAlertState(
      showAlert(
        'Delete Image Model',
        `Are you sure you want to delete "${model.name}"? This will free up ${formatBytes(model.size)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => { executeDeleteImageModel(model); },
          },
        ],
      ),
    );
  };
  const handleDeleteItem = (item: DownloadItem) => {
    if (item.modelType === 'image') {
      const model = downloadedImageModels.find(m => m.id === item.modelId);
      if (model) handleDeleteImageModel(model);
    } else {
      const model = downloadedModels.find(m => m.id === item.modelId);
      if (model) handleDeleteModel(model);
    }
  };
  const handleRepairVision = (item: DownloadItem): void => {
    const lastSlash = item.modelId.lastIndexOf('/');
    if (lastSlash < 0) return;
    const repoId = item.modelId.substring(0, lastSlash);
    const fileName = item.modelId.substring(lastSlash + 1);
    const downloadKey = `${repoId}/${fileName}-mmproj`;
    setDownloadProgress(downloadKey, { progress: 0, bytesDownloaded: 0, totalBytes: 0 });
    logDownload('log', `Repair vision started for ${item.fileName}`);
    huggingFaceService.getModelFiles(repoId).then(async (files) => {
      const file = files.find(f => f.name === fileName);
      if (!file?.mmProjFile) { setDownloadProgress(downloadKey, null); setAlertState(showAlert('Error', 'Could not find vision projection file for this model')); return; }
      setDownloadProgress(downloadKey, { progress: 0, bytesDownloaded: 0, totalBytes: file.mmProjFile.size });
      await modelManager.repairMmProj(repoId, file, { onProgress: (p) => setDownloadProgress(downloadKey, p) });
      setDownloadProgress(downloadKey, null);
      const models = await modelManager.getDownloadedModels();
      setDownloadedModels(models);
      setAlertState(showAlert('Vision Repaired', `Vision file restored for ${item.fileName}. Reload the model to enable vision.`));
      logDownload('log', `Repair vision completed for ${item.fileName}`);
    }).catch((e: Error) => {
      setDownloadProgress(downloadKey, null);
      setAlertState(showAlert('Repair Failed', e.message));
      logDownload('error', `Repair vision failed for ${item.fileName}: ${e.message}`);
    });
  };

  // Build items from store state
  const data: DownloadItemsData = {
    downloadProgress,
    activeDownloads,
    activeBackgroundDownloads,
    downloadedModels,
    downloadedImageModels,
  };
  const items = buildDownloadItems(data);
  const activeItems = items.filter(i => i.type === 'active');
  const completedItems = items.filter(i => i.type === 'completed');
  const totalStorageUsed = completedItems.reduce((sum, item) => sum + item.fileSize, 0);

  return {
    isRefreshing,
    activeItems,
    completedItems,
    alertState,
    setAlertState,
    handleRefresh,
    handleRemoveDownload,
    handleRetryDownload,
    handleDeleteItem,
    handleRepairVision,
    totalStorageUsed,
    stats,
  };
}
