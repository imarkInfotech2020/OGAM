/**
 * Image (ONNX/CoreML) download provider. list/remove/reconcile are service-level.
 *
 * cancel + retry for image are UI-COUPLED (the working paths live in
 * imageDownloadActions/imageDownloadResume, which import CustomAlert → can't be
 * imported into a service without dragging UI/native into tests). So they're
 * INJECTED by the Download Manager via setImageDownloadOps — a clean dependency
 * seam: the provider stays UI-free, the UI supplies the alert-coupled image ops.
 * Falls back to a plain native cancel when no ops are registered.
 *
 * resumable: zip on Android only; multi-file (synthetic `image-multi:` id, no native
 * row) is never resumable → reconcile strands stranded in-flight as retriable error.
 */
import { Platform } from 'react-native';
import { modelManager } from '../../modelManager';
import { activeModelService } from '../../activeModelService';
import { backgroundDownloadService } from '../../backgroundDownloadService';
import { useAppStore } from '../../../stores';
import { useDownloadStore, isActiveStatus, DownloadEntry } from '../../../stores/downloadStore';
import logger from '../../../utils/logger';
import { mapStoreStatus } from '../storeStatus';
import type { DownloadProvider, ModelDownload } from '../types';

/** UI-coupled image ops the Download Manager injects (cancel/retry that need alerts). */
export interface ImageDownloadOps {
  cancel?: (modelId: string, entry: DownloadEntry) => Promise<void>;
  retry?: (modelId: string, entry: DownloadEntry) => Promise<void>;
}
let imageOps: ImageDownloadOps = {};
export function setImageDownloadOps(ops: ImageDownloadOps): void { imageOps = ops; }

const bareId = (storeModelId: string): string => storeModelId.replace(/^image:/, '');
const modelIdOf = (id: string): string => id.replace(/^image:/, '');
const isMultifile = (e: DownloadEntry): boolean => e.downloadId.startsWith('image-multi:');
const imageEntries = (): DownloadEntry[] =>
  Object.values(useDownloadStore.getState().downloads).filter(e => e.modelType === 'image');
const findEntry = (modelId: string): DownloadEntry | undefined =>
  imageEntries().find(e => bareId(e.modelId) === modelId);

export const imageProvider: DownloadProvider = {
  modelType: 'image',

  async list(): Promise<ModelDownload[]> {
    const out: ModelDownload[] = [];
    // retry is only honest when the UI has injected the (alert-coupled) image retry;
    // cancel always works (native fallback). Declaring retry from the real op keeps
    // the capability truthful instead of advertising a retry that silently refuses.
    const canRetry = !!imageOps.retry;
    for (const e of imageEntries()) {
      const id = bareId(e.modelId);
      // multi-file (no native row) is never resumable; zip resumes on Android.
      const resumable = !isMultifile(e) && Platform.OS === 'android';
      out.push({
        id: `image:${id}`, modelType: 'image', name: e.fileName || id,
        sizeBytes: e.combinedTotalBytes || e.totalBytes, bytesDownloaded: e.bytesDownloaded,
        progress: e.progress, status: mapStoreStatus(e.status),
        capabilities: { cancel: true, retry: canRetry, remove: true, resumable, determinateProgress: true },
        error: e.errorMessage,
      });
    }
    const inflight = new Set(out.map(d => d.id));
    for (const m of useAppStore.getState().downloadedImageModels) {
      const id = `image:${m.id}`;
      if (inflight.has(id)) continue;
      out.push({
        id, modelType: 'image', name: m.name, sizeBytes: m.size, bytesDownloaded: m.size,
        progress: 1, status: 'completed',
        capabilities: { cancel: true, retry: true, remove: true, resumable: false, determinateProgress: true },
        filePath: m.modelPath,
      });
    }
    return out;
  },

  async cancel(id: string): Promise<void> {
    const modelId = modelIdOf(id);
    const entry = findEntry(modelId);
    if (!entry) return;
    if (imageOps.cancel) { await imageOps.cancel(modelId, entry); return; } // UI-coupled (multi-file)
    // Fallback: plain native cancel for a zip/native row.
    await backgroundDownloadService.cancelDownload(entry.downloadId).catch(() => {});
    useDownloadStore.getState().remove(entry.modelKey);
  },

  async retry(id: string): Promise<void> {
    const modelId = modelIdOf(id);
    const entry = findEntry(modelId);
    if (!entry) return;
    if (imageOps.retry) { await imageOps.retry(modelId, entry); return; } // UI-coupled (alerts, resume)
    logger.log(`[DL-SM] image:${modelId} retry: no image ops registered — refused`);
  },

  async remove(id: string): Promise<void> {
    const modelId = modelIdOf(id);
    const entry = findEntry(modelId);
    if (entry) {
      await backgroundDownloadService.cancelDownload(entry.downloadId).catch(() => {});
      useDownloadStore.getState().remove(entry.modelKey);
    }
    await activeModelService.unloadImageModel().catch(() => {});
    await modelManager.deleteImageModel(modelId).catch(err => logger.warn('[imageProvider] delete failed:', err));
    useAppStore.getState().removeDownloadedImageModel(modelId);
  },

  subscribe(onChange: () => void): () => void {
    return useDownloadStore.subscribe(onChange);
  },

  async reconcile(): Promise<void> {
    // Multi-file has no native row (never resumes); iOS zip foreground dies too.
    const store = useDownloadStore.getState();
    for (const e of imageEntries()) {
      if (!isActiveStatus(e.status)) continue;
      const resumableOnRelaunch = !isMultifile(e) && Platform.OS === 'android';
      if (resumableOnRelaunch) continue;
      logger.log(`[DL-SM] image:${bareId(e.modelId)} reconcile: interrupted (multifile/iOS) → failed`);
      store.setStatus(e.downloadId, 'failed', { message: 'Interrupted — app closed. Tap retry.' });
    }
  },
};
