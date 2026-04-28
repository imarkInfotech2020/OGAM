import { useState } from 'react';
import { Platform } from 'react-native';
import { AlertState, showAlert, hideAlert, initialAlertState } from '../../components/CustomAlert';
import { useAppStore } from '../../stores';
import { useDownloadStore, DownloadEntry } from '../../stores/downloadStore';
import {
  modelManager,
  activeModelService,
  hardwareService,
  huggingFaceService,
  backgroundDownloadService,
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
  handleRetryDownload: (item: DownloadItem) => void;
  handleDeleteItem: (item: DownloadItem) => void;
  handleRepairVision: (item: DownloadItem) => void;
  isRepairingVision: (modelId: string) => boolean;
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

function getActiveItemModelId(entry: DownloadEntry, isImage: boolean): string {
  if (isImage && entry.modelId.startsWith('image:')) {
    return entry.modelId.replace('image:', '');
  }
  return entry.modelId;
}

function getActiveItemFileName(
  entry: DownloadEntry,
  isImage: boolean,
  metadata: Record<string, any> | null,
): string {
  return isImage && metadata?.imageModelName
    ? metadata.imageModelName
    : entry.fileName;
}

function getImageAuthor(backend?: string): string {
  if (backend === 'coreml') return 'Core ML';
  if (backend === 'qnn') return 'NPU';
  if (backend === 'mnn') return 'GPU';
  return 'Image Generation';
}

function getActiveItemAuthor(
  entry: DownloadEntry,
  isImage: boolean,
  metadata: Record<string, any> | null,
): string {
  if (isImage) return getImageAuthor(metadata?.imageModelBackend);
  return entry.modelId.split('/')[0] ?? 'Unknown';
}

function getActiveItemQuantization(
  entry: DownloadEntry,
  isImage: boolean,
  metadata: Record<string, any> | null,
): string {
  if (!isImage) return entry.quantization;
  return metadata?.imageModelBackend === 'coreml' ? 'Core ML' : '';
}

function entryToActiveItem(entry: DownloadEntry): DownloadItem {
  const metadata = parseEntryMetadata(entry);
  const isImage = entry.modelType === 'image';

  return {
    type: 'active',
    modelType: entry.modelType,
    downloadId: entry.downloadId,
    modelKey: entry.modelKey,
    modelId: getActiveItemModelId(entry, isImage),
    fileName: getActiveItemFileName(entry, isImage, metadata),
    author: getActiveItemAuthor(entry, isImage, metadata),
    quantization: getActiveItemQuantization(entry, isImage, metadata),
    fileSize: entry.combinedTotalBytes || entry.totalBytes,
    bytesDownloaded: entry.bytesDownloaded + (entry.mmProjBytesDownloaded ?? 0),
    progress: entry.progress,
    status: entry.status,
    reason: entry.errorMessage,
    reasonCode: entry.errorCode as import('../../types').BackgroundDownloadReasonCode | undefined,
  };
}

export function useDownloadManager(): UseDownloadManagerResult {
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const repairingVisionIds = useDownloadStore(s => s.repairingVisionIds);
  const setRepairingVision = useDownloadStore(s => s.setRepairingVision);
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
          name: model.name,
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

  const handleRetryDownload = async (item: DownloadItem) => {
    if (!item.downloadId) return;
    try {
      useDownloadStore.getState().setStatus(item.downloadId, 'pending');
      if (Platform.OS === 'android') {
        await backgroundDownloadService.retryDownload(item.downloadId);
      }
      backgroundDownloadService.startProgressPolling();
    } catch (error: any) {
      logger.error('[DownloadManager] Failed to retry download:', error);
      const errorMessage = error?.message || 'Retry failed. Please remove and re-download.';
      useDownloadStore.getState().setStatus(item.downloadId, 'failed', {
        message: errorMessage,
      });
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
    setRepairingVision(item.modelId, true);
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
    }).finally(() => {
      setRepairingVision(item.modelId, false);
    });
  };

  const isRepairingVision = (modelId: string) => !!repairingVisionIds[modelId];

  return {
    activeItems,
    completedItems,
    alertState,
    setAlertState,
    handleRemoveDownload,
    handleRetryDownload,
    handleDeleteItem,
    handleRepairVision,
    isRepairingVision,
    totalStorageUsed,
  };
}
