import { useState, useCallback, useMemo, useEffect } from 'react';
import { Platform } from 'react-native';
import { AlertState } from '../../components/CustomAlert';
import { useAppStore } from '../../stores';
import { modelManager, hardwareService, backgroundDownloadService } from '../../services';
import { fetchAvailableModels, HFImageModel } from '../../services/huggingFaceModelBrowser';
import { fetchAvailableCoreMLModels } from '../../services/coreMLModelBrowser';
import { ImageModelRecommendation } from '../../types';
import { BackendFilter, ImageFilterDimension, ImageModelDescriptor } from './types';
import { matchesSdVersionFilter } from './utils';
import {
  ImageDownloadDeps,
  handleDownloadImageModel as downloadImageModel,
} from './imageDownloadActions';
import logger from '../../utils/logger';

export function useImageModels(setAlertState: (s: AlertState) => void) {
  const [availableHFModels, setAvailableHFModels] = useState<HFImageModel[]>([]);
  const [hfModelsLoading, setHfModelsLoading] = useState(false);
  const [hfModelsError, setHfModelsError] = useState<string | null>(null);
  const [backendFilter, setBackendFilter] = useState<BackendFilter>('all');
  const [styleFilter, setStyleFilter] = useState<string>('all');
  const [sdVersionFilter, setSdVersionFilter] = useState<string>('all');
  const [imageFilterExpanded, setImageFilterExpanded] = useState<ImageFilterDimension>(null);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageFiltersVisible, setImageFiltersVisible] = useState(false);
  const [imageRec, setImageRec] = useState<ImageModelRecommendation | null>(null);
  const [userChangedBackendFilter, setUserChangedBackendFilter] = useState(false);
  const [showRecommendedOnly, setShowRecommendedOnly] = useState(true);
  const [showRecHint, setShowRecHint] = useState(true);
  const [imageModelProgress, setImageModelProgress] = useState<Record<string, number>>({});

  const {
    downloadedImageModels, setDownloadedImageModels, addDownloadedImageModel,
    activeImageModelId, setActiveImageModelId,
    imageModelDownloading, addImageModelDownloading, removeImageModelDownloading,
    setImageModelDownloadId, setBackgroundDownload,
  } = useAppStore();

  const updateModelProgress = (modelId: string, n: number) =>
    setImageModelProgress(prev => ({ ...prev, [modelId]: n }));
  const clearModelProgress = (modelId: string) =>
    setImageModelProgress(prev => { const next = { ...prev }; delete next[modelId]; return next; });

  const makeDeps = (): ImageDownloadDeps => ({
    addImageModelDownloading, removeImageModelDownloading,
    updateModelProgress, clearModelProgress,
    addDownloadedImageModel, activeImageModelId,
    setActiveImageModelId, setImageModelDownloadId,
    setBackgroundDownload, setAlertState,
  });

  const loadDownloadedImageModels = async () => {
    const models = await modelManager.getDownloadedImageModels();
    setDownloadedImageModels(models);
  };

  const loadHFModels = useCallback(async (forceRefresh = false) => {
    setHfModelsLoading(true); setHfModelsError(null);
    try {
      if (Platform.OS === 'ios') {
        const coremlModels = await fetchAvailableCoreMLModels(forceRefresh);
        setAvailableHFModels(coremlModels.map(m => ({
          id: m.id, name: m.name, displayName: m.displayName, backend: 'coreml' as any,
          fileName: m.fileName, downloadUrl: m.downloadUrl, size: m.size, repo: m.repo,
          _coreml: true, _coremlFiles: m.files,
        })));
      } else {
        setAvailableHFModels(await fetchAvailableModels(forceRefresh));
      }
    } catch (error: any) {
      setHfModelsError(error?.message || 'Failed to fetch models');
    } finally {
      setHfModelsLoading(false);
    }
  }, []);

  const restoreActiveImageDownloads = async () => {
    if (!backgroundDownloadService.isAvailable()) return;
    try {
      const activeDownloads = await modelManager.getActiveBackgroundDownloads();
      const imageDownloads = activeDownloads.filter(d =>
        d.modelId.startsWith('image:') && ['running', 'pending', 'paused'].includes(d.status)
      );
      const activeNativeIds = new Set(imageDownloads.map(d => d.modelId.replace('image:', '')));
      for (const modelId of imageModelDownloading) {
        if (!activeNativeIds.has(modelId)) removeImageModelDownloading(modelId);
      }
      for (const download of imageDownloads) {
        const modelId = download.modelId.replace('image:', '');
        addImageModelDownloading(modelId);
        setImageModelDownloadId(modelId, download.downloadId);
        updateModelProgress(modelId, download.totalBytes > 0 ? download.bytesDownloaded / download.totalBytes : 0);
      }
    } catch (e) { logger.warn('[ModelsScreen] Failed to restore image downloads:', e); }
  };

  useEffect(() => {
    loadDownloadedImageModels();
    restoreActiveImageDownloads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    hardwareService.getImageModelRecommendation().then(rec => {
      if (cancelled) return;
      setImageRec(rec);
      if (!userChangedBackendFilter && Platform.OS !== 'ios') {
        setBackendFilter(
          rec.recommendedBackend === 'qnn' ? 'qnn'
          : rec.recommendedBackend === 'mnn' ? 'mnn'
          : 'all'
        );
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearImageFilters = useCallback(() => {
    setBackendFilter('all'); setUserChangedBackendFilter(true);
    setStyleFilter('all'); setSdVersionFilter('all'); setImageFilterExpanded(null);
  }, []);

  const isRecommendedModel = useCallback((model: HFImageModel): boolean => {
    if (!imageRec) return false;
    if (model.backend !== imageRec.recommendedBackend && imageRec.recommendedBackend !== 'all') return false;
    if (imageRec.qnnVariant && model.variant) return model.variant.includes(imageRec.qnnVariant);
    if (imageRec.recommendedModels?.length) {
      const fields = [model.name, model.repo, model.id].map(s => s.toLowerCase());
      return imageRec.recommendedModels.some(p => fields.some(f => f.includes(p)));
    }
    return true;
  }, [imageRec]);

  const filteredHFModels = useMemo(() => {
    const query = imageSearchQuery.toLowerCase().trim();
    const filtered = availableHFModels.filter(m => {
      if (showRecommendedOnly && imageRec && !isRecommendedModel(m)) return false;
      if (backendFilter !== 'all' && m.backend !== backendFilter) return false;
      if (styleFilter !== 'all' && (m as any).style !== styleFilter) return false;
      if (!matchesSdVersionFilter(m.name, sdVersionFilter)) return false;
      if (downloadedImageModels.some(d => d.id === m.id)) return false;
      if (query && !m.displayName.toLowerCase().includes(query) && !m.name.toLowerCase().includes(query)) return false;
      return true;
    });
    if (!showRecommendedOnly) filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return filtered;
  }, [availableHFModels, backendFilter, styleFilter, sdVersionFilter, downloadedImageModels, imageSearchQuery, imageRec, isRecommendedModel, showRecommendedOnly]);

  const hasActiveImageFilters = backendFilter !== 'all' || styleFilter !== 'all' || sdVersionFilter !== 'all';
  const imageRecommendation = imageRec?.bannerText ?? 'Loading recommendation...';

  const handleDownloadImageModel = (modelInfo: ImageModelDescriptor) =>
    downloadImageModel(modelInfo, makeDeps());

  return {
    availableHFModels, hfModelsLoading, hfModelsError,
    backendFilter, setBackendFilter,
    styleFilter, setStyleFilter,
    sdVersionFilter, setSdVersionFilter,
    imageFilterExpanded, setImageFilterExpanded,
    imageSearchQuery, setImageSearchQuery,
    imageFiltersVisible, setImageFiltersVisible,
    imageRec, showRecommendedOnly, setShowRecommendedOnly,
    showRecHint, setShowRecHint,
    imageModelProgress, downloadedImageModels, imageModelDownloading,
    hasActiveImageFilters, filteredHFModels, imageRecommendation,
    loadHFModels, loadDownloadedImageModels, restoreActiveImageDownloads,
    clearImageFilters, isRecommendedModel, handleDownloadImageModel,
    setUserChangedBackendFilter,
  };
}
