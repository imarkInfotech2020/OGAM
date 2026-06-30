/**
 * Text (GGUF) download provider. Wraps the proven text bridge — modelManager +
 * backgroundDownloadService + downloadStore + appStore — under the uniform
 * contract. All calls are service-level (no UI import), so retry lives here
 * cleanly (text retry never needed an alert; only image does).
 *
 * resumable: Android only (WorkManager persists across app-kill; iOS foreground
 * URLSession dies). The native bytes can't resume on iOS, so reconcile() re-queues an
 * interrupted download (re-issues it through the same concurrency cap) rather than
 * leaving it failed for the user to retry by hand. The gap is the `resumable` flag,
 * not a Platform.OS branch in callers.
 */
import { Platform } from 'react-native';
import { modelManager } from '../../modelManager';
import { backgroundDownloadService } from '../../backgroundDownloadService';
import { huggingFaceService } from '../../huggingface';
import { hardwareService } from '../../hardware';
import { useAppStore } from '../../../stores';
import { useDownloadStore, isActiveStatus, DownloadEntry } from '../../../stores/downloadStore';
import logger from '../../../utils/logger';
import { mapStoreStatus } from '../storeStatus';
import { uniformDownloadId } from '../uniformId';
import type { DownloadProvider, ModelDownload } from '../types';

const TEXT_CAPABILITIES = {
  cancel: true,
  retry: true,
  remove: true,
  resumable: Platform.OS === 'android',
  determinateProgress: true,
} as const;

const modelIdOf = (id: string): string => id.replace(/^text:/, '');
const textEntries = (): DownloadEntry[] =>
  Object.values(useDownloadStore.getState().downloads).filter(e => e.modelType === 'text');
const findEntry = (modelId: string): DownloadEntry | undefined =>
  textEntries().find(e => e.modelId === modelId);

/** iOS re-start: foreground URLSession can't resume, so re-issue the download from
 *  scratch. It flows through startDownload's 3-slot cap (queued if full). Shared by
 *  retry (one model) and reconcile (every interrupted model on relaunch). */
async function restartIosTextDownload(entry: DownloadEntry): Promise<void> {
  const meta = entry.metadataJson ? safeJson(entry.metadataJson) : null;
  const mmProjFile = entry.mmProjFileName && entry.mmProjFileSize && meta?.mmProjDownloadUrl
    ? { name: entry.mmProjFileName, size: entry.mmProjFileSize, downloadUrl: meta.mmProjDownloadUrl }
    : undefined;
  const file = {
    name: entry.fileName, size: entry.totalBytes, quantization: entry.quantization,
    downloadUrl: huggingFaceService.getDownloadUrl(entry.modelId, entry.fileName),
    ...(mmProjFile ? { mmProjFile } : {}),
  };
  const info = await modelManager.downloadModelBackground(entry.modelId, file);
  reattach(info.downloadId);
}

/** Re-attach the finalizer to a retried text download (move+register+persist on
 *  complete, mark failed on error) — the same recovery the manager used. */
function reattach(downloadId: string): void {
  modelManager.watchDownload(
    downloadId,
    async () => {
      const models = await modelManager.getDownloadedModels();
      useAppStore.getState().setDownloadedModels(models);
      const modelKey = useDownloadStore.getState().downloadIdIndex[downloadId] ?? '';
      if (modelKey) useDownloadStore.getState().remove(modelKey);
    },
    (error: Error) => {
      useDownloadStore.getState().setStatus(downloadId, 'failed', { message: error.message });
    },
  );
}

export const textProvider: DownloadProvider = {
  modelType: 'text',

  async list(): Promise<ModelDownload[]> {
    const out: ModelDownload[] = [];
    for (const e of textEntries()) {
      out.push({
        id: uniformDownloadId('text', e.modelId), modelType: 'text', name: e.fileName || e.modelId,
        sizeBytes: e.combinedTotalBytes || e.totalBytes,
        bytesDownloaded: e.bytesDownloaded + (e.mmProjBytesDownloaded ?? 0),
        progress: e.progress, status: mapStoreStatus(e.status),
        capabilities: TEXT_CAPABILITIES, error: e.errorMessage,
      });
    }
    const inflight = new Set(out.map(d => d.id));
    for (const m of useAppStore.getState().downloadedModels) {
      const id = uniformDownloadId('text', m.id);
      if (inflight.has(id)) continue;
      const size = hardwareService.getModelTotalSize(m);
      out.push({
        id, modelType: 'text', name: m.fileName, sizeBytes: size, bytesDownloaded: size,
        progress: 1, status: 'completed', capabilities: TEXT_CAPABILITIES, filePath: m.filePath,
      });
    }
    return out;
  },

  async cancel(id: string): Promise<void> {
    const entry = findEntry(modelIdOf(id));
    if (!entry) return;
    await modelManager.cancelBackgroundDownload(entry.downloadId)
      .catch(err => logger.log(`[DL-SM] ${id} cancel: native cancel failed err=${msg(err)}`));
    if (entry.mmProjDownloadId) await modelManager.cancelBackgroundDownload(entry.mmProjDownloadId)
      .catch(err => logger.log(`[DL-SM] ${id} cancel: mmproj native cancel failed err=${msg(err)}`));
    useDownloadStore.getState().remove(entry.modelKey);
  },

  async retry(id: string): Promise<void> {
    const modelId = modelIdOf(id);
    const entry = findEntry(modelId);
    if (!entry?.downloadId) return;
    if (Platform.OS === 'android') {
      useDownloadStore.getState().setStatus(entry.downloadId, 'pending');
      await backgroundDownloadService.retryDownload(entry.downloadId);
      if (entry.mmProjDownloadId && entry.mmProjStatus === 'failed') {
        useDownloadStore.getState().setStatus(entry.mmProjDownloadId, 'pending');
        await backgroundDownloadService.retryDownload(entry.mmProjDownloadId).catch(() => {});
        modelManager.resetMmProjForRetry(entry.downloadId);
      }
      reattach(entry.downloadId);
    } else {
      await restartIosTextDownload(entry); // foreground URLSession can't resume → re-issue
    }
    backgroundDownloadService.startProgressPolling();
  },

  async remove(id: string): Promise<void> {
    const modelId = modelIdOf(id);
    const entry = findEntry(modelId);
    if (entry) {
      await modelManager.cancelBackgroundDownload(entry.downloadId)
        .catch(err => logger.log(`[DL-SM] ${id} remove: native cancel failed err=${msg(err)}`));
      useDownloadStore.getState().remove(entry.modelKey);
    }
    await modelManager.deleteModel(modelId)
      .catch(err => logger.log(`[DL-SM] ${id} remove: delete failed err=${msg(err)}`));
    useAppStore.getState().removeDownloadedModel(modelId);
  },

  subscribe(onChange: () => void): () => void {
    return useDownloadStore.subscribe(onChange);
  },

  async reconcile(): Promise<void> {
    if (Platform.OS === 'android') return; // WorkManager resumes — nothing to strand
    const store = useDownloadStore.getState();
    const registered = new Set(useAppStore.getState().downloadedModels.map(m => m.id));
    for (const e of textEntries()) {
      if (!isActiveStatus(e.status)) continue;
      if (registered.has(e.modelId)) {
        // Already on disk — this in-flight row is stale (a re-start of a completed
        // model). Drop it so there's never both a "Downloaded" and an "Active" entry
        // for the same model; never re-download something we already have.
        logger.log(`[DL-SM] text:${e.modelId} reconcile: already downloaded → dropping stale row`);
        store.remove(e.modelKey);
        continue;
      }
      // iOS foreground downloads die on app-kill and can't resume — but the user
      // shouldn't have to tap retry on each. Re-queue: mark 'pending' (→ 'queued'
      // in the service vocabulary) and re-issue through the SAME 3-slot cap a normal
      // start uses, so they auto-resume up to 3 and the rest wait their turn.
      logger.log(`[DL-SM] text:${e.modelId} reconcile: interrupted → re-queued`);
      store.setStatus(e.downloadId, 'pending');
      // Fire-and-forget: awaiting would block launch behind the cap; the queue drains
      // them. A failure to re-issue is logged, not silently dropped.
      restartIosTextDownload(e).catch(err =>
        logger.log(`[DL-SM] text:${e.modelId} reconcile: re-queue failed err=${msg(err)}`));
    }
  },
};

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
