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

export interface UseDownloadManagerResult {
  isRefreshing: boolean;
  activeItems: DownloadItem[];
  completedItems: DownloadItem[];
  alertState: AlertState;
  setAlertState: (state: AlertState) => void;
  handleRefresh: () => Promise<void>;
  handleRemoveDownload: (item: DownloadItem) => void;
  handleDeleteItem: (item: DownloadItem) => void;
  handleRepairVision: (item: DownloadItem) => void;
  totalStorageUsed: number;
}

async function purgeStaleImageDownloads(downloads: BackgroundDownloadInfo[]): Promise<BackgroundDownloadInfo[]> {
  const { downloadedImageModels } = useAppStore.getState();
  const downloadedIds = new Set(downloadedImageModels.map(m => m.id));
  logger.log('[DownloadManager] purgeStale: downloadedIds=', [...downloadedIds], 'active=', downloads.map(d => ({ id: d.modelId, status: d.status })));
  for (const d of downloads) {
    if (!d.modelId.startsWith('image:')) continue;
    if (downloadedIds.has(d.modelId.replace('image:', ''))) {
      logger.log('[DownloadManager] purging stale entry:', d.modelId, d.downloadId);
      backgroundDownloadService.moveCompletedDownload(d.downloadId, '').catch(() => {});
      backgroundDownloadService.cancelDownload(d.downloadId).catch(() => {});
    }
  }
  return downloads.filter(d =>
    (d.status === 'running' || d.status === 'pending' || d.status === 'paused') &&
    !(d.modelId.startsWith('image:') && downloadedIds.has(d.modelId.replace('image:', ''))),
  );
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

  // Load active background downloads on mount + start/stop polling
  useEffect(() => {
    loadActiveDownloads();

    if (backgroundDownloadService.isAvailable()) {
      modelManager.startBackgroundDownloadPolling();
    }
    // Do NOT stop polling on unmount — other screens (Models tab) rely on
    // the same native polling timer for progress events. Polling is cheap
    // (no-op when no active downloads) and stops automatically when all
    // downloads complete.
  }, []);

  // Subscribe to background download service events
  useEffect(() => {
    if (!backgroundDownloadService.isAvailable()) return;

    // Broadcast progress for all downloads. Per-download listeners (useTextModels)
    // compute combined GGUF+mmproj progress and fire first. We skip the update here
    // if the store already has a higher bytesDownloaded (i.e. combined progress).
    const unsubProgress = backgroundDownloadService.onAnyProgress((event) => {
      const metadata = useAppStore.getState().activeBackgroundDownloads[event.downloadId];
      if (!metadata) return;
      const key = `${metadata.modelId}/${metadata.fileName}`;
      if (cancelledKeysRef.current.has(key)) return;
      if ((useAppStore.getState().downloadProgress[key]?.bytesDownloaded ?? -1) >= event.bytesDownloaded) return;
      setDownloadProgress(key, {
        progress: event.totalBytes > 0 ? event.bytesDownloaded / event.totalBytes : 0,
        bytesDownloaded: event.bytesDownloaded,
        totalBytes: event.totalBytes,
        reason: event.reason || undefined,
      });
    });

    const unsubComplete = backgroundDownloadService.onAnyComplete(async (event) => {
      // Clear progress for image downloads (their per-download callbacks don't use the global store).
      // Text model cleanup is handled by useTextModels.onComplete.
      if (event.modelId.startsWith('image:')) {
        const key = `${event.modelId}/${event.fileName}`;
        setDownloadProgress(key, null);
      }
      await loadActiveDownloads();
    });

    const unsubError = backgroundDownloadService.onAnyError(async (event) => {
      setAlertState(showAlert('Download Failed', event.reason || 'Unknown error'));
      await loadActiveDownloads();
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };

  }, []);

  const loadActiveDownloads = async () => {
    if (backgroundDownloadService.isAvailable()) {
      const downloads = await modelManager.getActiveBackgroundDownloads();
      setActiveDownloads(await purgeStaleImageDownloads(downloads));
    }
  };
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadActiveDownloads();
    const models = await modelManager.getDownloadedModels();
    setDownloadedModels(models);
    const imageModels = await modelManager.getDownloadedImageModels();
    setDownloadedImageModels(imageModels);
    setIsRefreshing(false);

  }, []);

  const executeRemoveDownload = async (item: DownloadItem) => {
    setAlertState(hideAlert());
    try {
      const key = `${item.modelId}/${item.fileName}`;
      cancelledKeysRef.current.add(key);
      setDownloadProgress(key, null);
      let downloadId = item.downloadId;
      if (!downloadId) {
        const match = activeDownloads.find(d => activeBackgroundDownloads[d.downloadId]?.fileName === item.fileName);
        if (match) downloadId = match.downloadId;
      }
      if (downloadId) {
        setActiveDownloads(prev => prev.filter(d => d.downloadId !== downloadId));
        setBackgroundDownload(downloadId, null);
        await modelManager.cancelBackgroundDownload(downloadId);
      }
      if (item.modelId.startsWith('image:')) removeImageModelDownloading(item.modelId.replace('image:', ''));
      const dlId = downloadId;
      const capturedKey = key;
      setTimeout(() => {
        loadActiveDownloads().then(() => { if (dlId) cancelledKeysRef.current.delete(capturedKey); })
          .catch(err => logger.error('[DownloadManager] Failed to reload active downloads:', err));
      }, 1000);
    } catch (error) {
      logger.error('[DownloadManager] Failed to remove download:', error);
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

  const executeDeleteModel = async (model: DownloadedModel) => {
    setAlertState(hideAlert());
    try {
      await modelManager.deleteModel(model.id);
      removeDownloadedModel(model.id);
    } catch (error) {
      logger.error('[DownloadManager] Failed to delete model:', error);
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
      await activeModelService.unloadImageModel();
      await modelManager.deleteImageModel(model.id);
      removeDownloadedImageModel(model.id);
    } catch (error) {
      logger.error('[DownloadManager] Failed to delete image model:', error);
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
    huggingFaceService.getModelFiles(repoId).then(async (files) => {
      const file = files.find(f => f.name === fileName);
      if (!file?.mmProjFile) { setDownloadProgress(downloadKey, null); setAlertState(showAlert('Error', 'Could not find vision projection file for this model')); return; }
      setDownloadProgress(downloadKey, { progress: 0, bytesDownloaded: 0, totalBytes: file.mmProjFile.size });
      await modelManager.repairMmProj(repoId, file, { onProgress: (p) => setDownloadProgress(downloadKey, p) });
      setDownloadProgress(downloadKey, null);
      const models = await modelManager.getDownloadedModels();
      setDownloadedModels(models);
      setAlertState(showAlert('Vision Repaired', `Vision file restored for ${item.fileName}. Reload the model to enable vision.`));
    }).catch((e: Error) => { setDownloadProgress(downloadKey, null); setAlertState(showAlert('Repair Failed', e.message)); });
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
    handleDeleteItem,
    handleRepairVision,
    totalStorageUsed,
  };
}
