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
import { cancelSyntheticImageDownload } from '../ModelsScreen/imageDownloadActions';

export interface UseDownloadManagerResult {
  activeItems: DownloadItem[];
  completedItems: DownloadItem[];
  alertState: AlertState;
  setAlertState: (state: AlertState) => void;
  handleRemoveDownload: (item: DownloadItem) => void;
  handleDeleteItem: (item: DownloadItem) => void;
  handleRepairVision: (item: DownloadItem) => void;
  totalStorageUsed: number;
}

function parseEntryMetadata(entry: DownloadEntry): Record<string, any> | null {
  if (!entry.metadataJson) return null;
  try {
    return JSON.parse(entry.metadataJson);
  } catch {
    return null;
  }
}

function entryToActiveItem(entry: DownloadEntry): DownloadItem {
  const metadata = parseEntryMetadata(entry);
  const isImage = entry.modelType === 'image';
  const displayModelId = isImage && entry.modelId.startsWith('image:')
    ? entry.modelId.replace('image:', '')
    : entry.modelId;
  const displayFileName = isImage && metadata?.imageModelName
    ? metadata.imageModelName
    : entry.fileName;
  const displayAuthor = isImage
    ? (metadata?.imageModelBackend === 'coreml'
      ? 'Core ML'
      : metadata?.imageModelBackend === 'qnn'
        ? 'NPU'
        : metadata?.imageModelBackend === 'mnn'
          ? 'GPU'
          : 'Image Generation')
    : entry.modelId.split('/')[0] ?? 'Unknown';
  const displayQuantization = isImage
    ? (metadata?.imageModelBackend === 'coreml'
      ? 'Core ML'
      : '')
    : entry.quantization;

  return {
    type: 'active',
    modelType: entry.modelType,
    downloadId: entry.downloadId,
    modelKey: entry.modelKey,
    modelId: displayModelId,
    fileName: displayFileName,
    author: displayAuthor,
    quantization: displayQuantization,
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
  } = useAppStore();

  const downloads = useDownloadStore(state => state.downloads);
  const removeDownloadEntry = useDownloadStore(state => state.remove);

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
      const modelKey = item.modelKey ?? `${item.modelId}/${item.fileName}`;
      const entry = downloads[modelKey];
      removeDownloadEntry(modelKey);
      if (entry) {
        if (entry.downloadId.startsWith('image-multi:')) {
          await cancelSyntheticImageDownload(item.modelId).catch(() => {});
          return;
        }
        await modelManager.cancelBackgroundDownload(entry.downloadId).catch(() => {});
        if (entry.mmProjDownloadId) {
          await modelManager.cancelBackgroundDownload(entry.mmProjDownloadId).catch(() => {});
        }
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
    handleDeleteItem,
    handleRepairVision,
    totalStorageUsed,
  };
}
