import { useState } from 'react';
import { AlertState, showAlert, hideAlert, initialAlertState } from '../../components/CustomAlert';
import { useAppStore } from '../../stores';
import { useDownloadStore, DownloadEntry } from '../../stores/downloadStore';
import {
  modelManager,
  activeModelService,
  hardwareService,
  huggingFaceService,
} from '../../services';
import { DownloadedModel, ONNXImageModel } from '../../types';
import { DownloadItem, formatBytes } from './items';
import logger from '../../utils/logger';

export interface UseDownloadManagerResult {
  activeItems: DownloadItem[];
  completedItems: DownloadItem[];
  alertState: AlertState;
  setAlertState: (state: AlertState) => void;
  handleRemoveDownload: (item: DownloadItem) => void;
  handleRetryDownload: (item: DownloadItem) => void;
  handleDeleteItem: (item: DownloadItem) => void;
  handleRepairVision: (item: DownloadItem) => void;
  totalStorageUsed: number;
}

function entryToActiveItem(entry: DownloadEntry): DownloadItem {
  return {
    type: 'active',
    modelType: entry.modelType,
    downloadId: entry.downloadId,
    modelKey: entry.modelKey,
    modelId: entry.modelId,
    fileName: entry.fileName,
    author: entry.modelId.split('/')[0] ?? 'Unknown',
    quantization: entry.quantization,
    fileSize: entry.combinedTotalBytes || entry.totalBytes,
    bytesDownloaded: entry.bytesDownloaded + (entry.mmProjBytesDownloaded ?? 0),
    progress: entry.progress,
    status: entry.status,
    reason: entry.errorMessage,
  };
}

export function useDownloadManager(): UseDownloadManagerResult {
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const {
    downloadedModels,
    setDownloadedModels,
    removeDownloadedModel,
    downloadedImageModels,
    removeDownloadedImageModel,
    removeImageModelDownloading,
  } = useAppStore();

  const downloads = useDownloadStore(state => state.downloads);

  const activeItems: DownloadItem[] = Object.values(downloads)
    .filter(e => e.status !== 'completed' && e.status !== 'cancelled')
    .map(entryToActiveItem);

  const completedItems: DownloadItem[] = [
    ...downloadedModels.map((model): DownloadItem => {
      const totalSize = hardwareService.getModelTotalSize(model);
      return {
        type: 'completed',
        modelType: 'text',
        modelId: model.id,
        fileName: model.fileName,
        author: model.author,
        quantization: model.quantization,
        fileSize: totalSize,
        bytesDownloaded: totalSize,
        progress: 1,
        status: 'completed',
        downloadedAt: model.downloadedAt,
        filePath: model.filePath,
        isVisionModel: model.isVisionModel,
        mmProjPath: model.mmProjPath,
      };
    }),
    ...downloadedImageModels.map((model): DownloadItem => ({
      type: 'completed',
      modelType: 'image',
      modelId: model.id,
      fileName: model.name,
      author: 'Image Generation',
      quantization: '',
      fileSize: model.size,
      bytesDownloaded: model.size,
      progress: 1,
      status: 'completed',
      filePath: model.modelPath,
    })),
  ];

  const totalStorageUsed = completedItems.reduce((sum, item) => sum + item.fileSize, 0);

  const executeRemoveDownload = async (item: DownloadItem) => {
    setAlertState(hideAlert());
    try {
      const store = useDownloadStore.getState();
      const modelKey = item.modelKey ?? `${item.modelId}/${item.fileName}`;
      const entry = store.downloads[modelKey];
      store.remove(modelKey);
      if (entry) {
        await modelManager.cancelBackgroundDownload(entry.downloadId).catch(() => {});
        if (entry.mmProjDownloadId) {
          await modelManager.cancelBackgroundDownload(entry.mmProjDownloadId).catch(() => {});
        }
      }
      if (item.modelId.startsWith('image:')) {
        removeImageModelDownloading(item.modelId.replace('image:', ''));
      }
    } catch (error) {
      logger.error('[DownloadManager] Failed to remove download:', error);
      setAlertState(showAlert('Error', 'Failed to remove download'));
    }
  };

  const handleRemoveDownload = (item: DownloadItem) => {
    setAlertState(showAlert(
      'Remove Download',
      'Are you sure you want to remove this download?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: () => { executeRemoveDownload(item); } },
      ],
    ));
  };

  const executeRetryDownload = async (item: DownloadItem) => {
    setAlertState(hideAlert());
    const modelKey = item.modelKey ?? `${item.modelId}/${item.fileName}`;
    const entry = useDownloadStore.getState().downloads[modelKey];
    if (!entry) {
      setAlertState(showAlert('Error', 'Could not retry - download info not found'));
      return;
    }
    try {
      const downloadUrl = huggingFaceService.getDownloadUrl(entry.modelId, entry.fileName);
      const modelFile = {
        name: entry.fileName,
        size: entry.totalBytes,
        quantization: entry.quantization,
        downloadUrl,
      };
      const info = await modelManager.downloadModelBackground(entry.modelId, modelFile as any);
      useDownloadStore.getState().retryEntry(modelKey, info.downloadId);
      modelManager.watchDownload(
        info.downloadId,
        async (_dm) => {
          useDownloadStore.getState().setCompleted(info.downloadId);
          const models = await modelManager.getDownloadedModels();
          setDownloadedModels(models);
          setAlertState(showAlert('Download Complete', `${entry.fileName} downloaded successfully`));
        },
        (error) => {
          useDownloadStore.getState().setStatus(info.downloadId, 'failed', { message: error.message });
        },
      );
    } catch (error) {
      logger.error('[DownloadManager] Failed to retry download:', error);
      setAlertState(showAlert('Error', 'Failed to retry download'));
    }
  };

  const handleRetryDownload = (item: DownloadItem) => {
    setAlertState(showAlert(
      'Retry Download',
      'This will restart the download from the beginning. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', style: 'default', onPress: () => { executeRetryDownload(item); } },
      ],
    ));
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

  const handleDeleteItem = (item: DownloadItem) => {
    if (item.modelType === 'image') {
      const model = downloadedImageModels.find(m => m.id === item.modelId);
      if (!model) return;
      setAlertState(showAlert(
        'Delete Image Model',
        `Are you sure you want to delete "${model.name}"? This will free up ${formatBytes(model.size)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => { executeDeleteImageModel(model); } },
        ],
      ));
    } else {
      const model = downloadedModels.find(m => m.id === item.modelId);
      if (!model) return;
      const totalSize = hardwareService.getModelTotalSize(model);
      setAlertState(showAlert(
        'Delete Model',
        `Are you sure you want to delete "${model.fileName}"? This will free up ${formatBytes(totalSize)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => { executeDeleteModel(model); } },
        ],
      ));
    }
  };

  const handleRepairVision = (item: DownloadItem): void => {
    const lastSlash = item.modelId.lastIndexOf('/');
    if (lastSlash < 0) return;
    const repoId = item.modelId.substring(0, lastSlash);
    const fileName = item.modelId.substring(lastSlash + 1);
    huggingFaceService.getModelFiles(repoId).then(async (files) => {
      const file = files.find(f => f.name === fileName);
      if (!file?.mmProjFile) {
        setAlertState(showAlert(
          'No Vision File Available',
          'This model does not publish a separate vision projection file. Re-download the original (non-i1) variant if vision support is required.',
        ));
        return;
      }
      await modelManager.repairMmProj(repoId, file, {});
      const models = await modelManager.getDownloadedModels();
      setDownloadedModels(models);
      setAlertState(showAlert('Vision Repaired', `Vision file restored for ${item.fileName}. Reload the model to enable vision.`));
    }).catch((e: Error) => {
      setAlertState(showAlert('Repair Failed', e.message));
    });
  };

  return {
    activeItems,
    completedItems,
    alertState,
    setAlertState,
    handleRemoveDownload,
    handleRetryDownload,
    handleDeleteItem,
    handleRepairVision,
    totalStorageUsed,
  };
}
