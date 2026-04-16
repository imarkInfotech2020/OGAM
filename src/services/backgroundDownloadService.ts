import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid, Alert } from 'react-native';
import { BackgroundDownloadInfo, BackgroundDownloadStatus } from '../types';
import logger from '../utils/logger';
import type {
  DownloadParams, MultiFileDownloadParams,
  DownloadProgressEvent, DownloadCompleteEvent, DownloadErrorEvent,
  DownloadProgressCallback, DownloadCompleteCallback, DownloadErrorCallback,
} from './backgroundDownloadTypes';
const { DownloadManagerModule } = NativeModules;

function logDownloadDebug(entry: {
  level: 'log' | 'warn' | 'error';
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}): void {
  const payload = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  logger[entry.level](`[${entry.scope}] ${entry.message}${payload}`);
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

function describeProgressForLog(bytesDownloaded: number, totalBytes: number): {
  transferred: string;
  percent: string;
} {
  const transferred = totalBytes > 0
    ? `${formatBytesForLog(bytesDownloaded)} / ${formatBytesForLog(totalBytes)}`
    : formatBytesForLog(bytesDownloaded);
  const percent = totalBytes > 0
    ? `${Math.max(0, Math.min(100, (bytesDownloaded / totalBytes) * 100)).toFixed(1)}%`
    : 'unknown';
  return { transferred, percent };
}

class BackgroundDownloadService {
  private eventEmitter: NativeEventEmitter | null = null;
  private progressListeners: Map<string, DownloadProgressCallback> = new Map();
  private completeListeners: Map<string, DownloadCompleteCallback> = new Map();
  private errorListeners: Map<string, DownloadErrorCallback> = new Map();
  private subscriptions: { remove: () => void }[] = [];
  private isPolling = false;
  private silentDownloadIds: Set<number> = new Set();

  constructor() {
    if (this.isAvailable()) {
      this.eventEmitter = new NativeEventEmitter(DownloadManagerModule);
      this.setupEventListeners();
    }
  }

  isAvailable(): boolean {
    return DownloadManagerModule != null;
  }

  async startDownload(params: DownloadParams): Promise<BackgroundDownloadInfo> {
    if (!this.isAvailable()) {
      throw new Error('Background downloads not available on this platform');
    }
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'startDownload requested', meta: {
      fileName: params.fileName,
      modelId: params.modelId,
      totalBytes: params.totalBytes ?? 0,
      hasSha256: !!params.sha256,
    } });

    const result = await DownloadManagerModule.startDownload({
      url: params.url,
      fileName: params.fileName,
      modelId: params.modelId,
      title: params.title || `Downloading ${params.fileName}`,
      description: params.description || 'Model download in progress...',
      totalBytes: params.totalBytes || 0,
      sha256: params.sha256,
    });
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'startDownload native success', meta: {
      downloadId: result.downloadId,
      fileName: result.fileName,
      modelId: result.modelId,
    } });

    return {
      downloadId: result.downloadId,
      fileName: result.fileName,
      modelId: result.modelId,
      status: 'pending',
      bytesDownloaded: 0,
      totalBytes: params.totalBytes || 0,
      startedAt: Date.now(),
    };
  }

  async startMultiFileDownload(params: MultiFileDownloadParams): Promise<BackgroundDownloadInfo> {
    if (!this.isAvailable()) {
      throw new Error('Background downloads not available on this platform');
    }

    const result = await DownloadManagerModule.startMultiFileDownload({
      files: params.files,
      fileName: params.fileName,
      modelId: params.modelId,
      destinationDir: params.destinationDir,
      totalBytes: params.totalBytes || 0,
    });

    return {
      downloadId: result.downloadId,
      fileName: result.fileName,
      modelId: result.modelId,
      status: 'pending',
      bytesDownloaded: 0,
      totalBytes: params.totalBytes || 0,
      startedAt: Date.now(),
    };
  }

  async cancelDownload(downloadId: number): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Background downloads not available on this platform');
    }
    try {
      logDownloadDebug({ level: 'warn', scope: 'BackgroundDownloadService', message: 'cancelDownload requested', meta: { downloadId } });
      await DownloadManagerModule.cancelDownload(downloadId);
      logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'cancelDownload native success', meta: { downloadId } });
    } catch (e) {
      logger.log('[BackgroundDownload] cancelDownload failed (bridge may be torn down):', e);
      logDownloadDebug({ level: 'error', scope: 'BackgroundDownloadService', message: 'cancelDownload native failed', meta: {
        downloadId,
        error: e instanceof Error ? e.message : String(e),
      } });
    }
  }

  async getActiveDownloads(): Promise<BackgroundDownloadInfo[]> {
    if (!this.isAvailable()) {
      return [];
    }
    const downloads = await DownloadManagerModule.getActiveDownloads();
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'getActiveDownloads resolved', meta: {
      count: downloads.length,
      statuses: downloads.map((d: any) => d.status).join(','),
    } });
    return downloads.map((d: any) => ({
      downloadId: d.downloadId,
      fileName: d.fileName,
      modelId: d.modelId,
      status: d.status as BackgroundDownloadStatus,
      bytesDownloaded: d.bytesDownloaded,
      totalBytes: d.totalBytes,
      localUri: d.localUri,
      startedAt: d.startedAt,
      reason: d.reason || undefined,
      reasonCode: d.reasonCode || undefined,
      failureReason: d.reason || undefined,
    }));
  }

  async getDownloadProgress(downloadId: number): Promise<{
    bytesDownloaded: number;
    totalBytes: number;
    status: BackgroundDownloadStatus;
    localUri?: string;
    reason?: string;
    reasonCode?: string;
  }> {
    if (!this.isAvailable()) {
      throw new Error('Background downloads not available on this platform');
    }
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'getDownloadProgress requested', meta: { downloadId } });
    const progress = await DownloadManagerModule.getDownloadProgress(downloadId);
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'getDownloadProgress resolved', meta: {
      downloadId,
      status: progress.status,
      bytesDownloaded: progress.bytesDownloaded,
      totalBytes: progress.totalBytes,
      reason: progress.reason || '',
      reasonCode: progress.reasonCode || '',
    } });
    return {
      bytesDownloaded: progress.bytesDownloaded,
      totalBytes: progress.totalBytes,
      status: progress.status as BackgroundDownloadStatus,
      localUri: progress.localUri || undefined,
      reason: progress.reason || undefined,
      reasonCode: progress.reasonCode || undefined,
    };
  }

  async moveCompletedDownload(downloadId: number, targetPath: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Background downloads not available on this platform');
    }
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'moveCompletedDownload requested', meta: {
      downloadId,
      targetPath,
    } });
    const moved = await DownloadManagerModule.moveCompletedDownload(downloadId, targetPath);
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'moveCompletedDownload resolved', meta: {
      downloadId,
      movedPath: moved,
    } });
    return moved;
  }

  private registerListener<T>(listeners: Map<string, T>, key: string, callback: T): () => void {
    listeners.set(key, callback);
    return () => listeners.delete(key);
  }

  onProgress(downloadId: number, callback: DownloadProgressCallback): () => void {
    return this.registerListener(this.progressListeners, `progress_${downloadId}`, callback);
  }
  onComplete(downloadId: number, callback: DownloadCompleteCallback): () => void {
    return this.registerListener(this.completeListeners, `complete_${downloadId}`, callback);
  }
  onError(downloadId: number, callback: DownloadErrorCallback): () => void {
    return this.registerListener(this.errorListeners, `error_${downloadId}`, callback);
  }
  onAnyProgress(callback: DownloadProgressCallback): () => void {
    return this.registerListener(this.progressListeners, 'progress_all', callback);
  }
  onAnyComplete(callback: DownloadCompleteCallback): () => void {
    return this.registerListener(this.completeListeners, 'complete_all', callback);
  }
  onAnyError(callback: DownloadErrorCallback): () => void {
    return this.registerListener(this.errorListeners, 'error_all', callback);
  }
  startProgressPolling(): void {
    if (!this.isAvailable() || this.isPolling) {
      return;
    }
    this.isPolling = true;
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'startProgressPolling', meta: {} });
    DownloadManagerModule.startProgressPolling();
  }

  stopProgressPolling(): void {
    if (!this.isAvailable() || !this.isPolling) {
      return;
    }
    this.isPolling = false;
    logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'stopProgressPolling', meta: {} });
    DownloadManagerModule.stopProgressPolling();
  }

  async requestNotificationPermission(): Promise<void> {
    if (Platform.OS !== 'android' || Platform.Version < 33) return;
    try {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    } catch {
      // Non-fatal — download still works, just no system notification
    }
  }

  /** Returns true if battery optimization is ignored, or if unsupported (iOS, old Android). */
  async isBatteryOptimizationIgnored(): Promise<boolean> {
    if (Platform.OS !== 'android' || !this.isAvailable()) return true;
    try {
      return await DownloadManagerModule.isBatteryOptimizationIgnored();
    } catch {
      return true; // fail open
    }
  }

  /** Opens the system dialog to exempt this app from battery optimization. */
  requestBatteryOptimizationIgnore(): void {
    if (Platform.OS !== 'android' || !this.isAvailable()) return;
    try {
      DownloadManagerModule.requestBatteryOptimizationIgnore();
    } catch (e) {
      logger.log('[BackgroundDownload] requestBatteryOptimizationIgnore failed:', e);
    }
  }

  /** Checks battery optimization and prompts once if not whitelisted. Call before starting a download. */
  async checkAndPromptBatteryOptimization(): Promise<void> {
    if (Platform.OS !== 'android') return;
    const ignored = await this.isBatteryOptimizationIgnored();
    if (ignored) return;
    return new Promise<void>(resolve => {
      Alert.alert(
        'Keep downloads running',
        'To prevent Android from pausing large model downloads when your screen is off, allow this app to run without battery restrictions.',
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => resolve(),
          },
          {
            text: 'Allow',
            onPress: () => {
              this.requestBatteryOptimizationIgnore();
              resolve();
            },
          },
        ],
        { cancelable: false },
      );
    });
  }

  /** Start a background download, wait for completion, then move to destPath. */
  downloadFileTo(opts: {
    params: DownloadParams;
    destPath: string;
    onProgress?: (bytesDownloaded: number, totalBytes: number) => void;
    silent?: boolean;
  }): { downloadId: number; downloadIdPromise: Promise<number>; promise: Promise<void> } {
    const { params, destPath, onProgress, silent } = opts;
    if (!this.isAvailable()) {
      throw new Error('Background downloads not available on this platform');
    }
    let resolvedDownloadId = 0;
    let resolveDownloadId!: (id: number) => void;
    let rejectDownloadId!: (error: unknown) => void;
    const downloadIdPromise = new Promise<number>((resolve, reject) => {
      resolveDownloadId = resolve;
      rejectDownloadId = reject;
    });
    const promise = (async () => {
      try {
        const info = await DownloadManagerModule.startDownload({
          url: params.url,
          fileName: params.fileName,
          modelId: params.modelId,
          title: params.title ?? `Downloading ${params.fileName}`,
          description: params.description ?? 'Downloading…',
          totalBytes: params.totalBytes ?? 0,
          hideNotification: silent === true,
        });
        this.startProgressPolling();
        const downloadId: number = info.downloadId;
        resolvedDownloadId = downloadId;
        resolveDownloadId(downloadId);
        if (silent) this.silentDownloadIds.add(downloadId);
        await new Promise<void>((resolve, reject) => {
          const removeProgress = onProgress
            ? this.onProgress(downloadId, (event) => {
                onProgress(event.bytesDownloaded, event.totalBytes);
              })
            : () => {};
          const removeComplete = this.onComplete(downloadId, async () => {
            removeProgress();
            removeComplete();
            removeError();
            this.silentDownloadIds.delete(downloadId);
            try {
              await this.moveCompletedDownload(downloadId, destPath);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
          const removeError = this.onError(downloadId, (event) => {
            removeProgress();
            removeComplete();
            removeError();
            this.silentDownloadIds.delete(downloadId);
            reject(new Error(event.reason ?? 'Download failed'));
          });
        });
      } catch (error) {
        if (resolvedDownloadId === 0) rejectDownloadId(error);
        throw error;
      }
    })();
    return { get downloadId() { return resolvedDownloadId; }, downloadIdPromise, promise };
  }

  markSilent(downloadId: number): void { this.silentDownloadIds.add(downloadId); }
  unmarkSilent(downloadId: number): void { this.silentDownloadIds.delete(downloadId); }

  async excludeFromBackup(path: string): Promise<boolean> {
    if (!this.isAvailable() || typeof DownloadManagerModule.excludePathFromBackup !== 'function') return false;
    return DownloadManagerModule.excludePathFromBackup(path).catch(() => false);
  }

  cleanup(): void {
    this.stopProgressPolling();
    this.subscriptions.forEach(sub => sub.remove());
    this.subscriptions = [];
    this.progressListeners.clear();
    this.completeListeners.clear();
    this.errorListeners.clear();
  }

  private dispatchToListeners<T extends { downloadId: number }>(
    listeners: Map<string, (e: T) => void>,
    prefix: string,
    event: T,
  ): void {
    listeners.get(`${prefix}_${event.downloadId}`)?.(event);
    if (!this.silentDownloadIds.has(event.downloadId)) {
      listeners.get(`${prefix}_all`)?.(event);
    }
  }

  private setupEventListeners(): void {
    if (!this.eventEmitter) return;
    const push = (s: { remove: () => void }) => this.subscriptions.push(s);
    push(this.eventEmitter.addListener('DownloadProgress', (e: DownloadProgressEvent) => {
      // Only log progress every 10% to reduce spam
      const pct = Math.floor((e.bytesDownloaded / e.totalBytes) * 100) || 0;
      if (pct % 10 === 0) {
        const progress = describeProgressForLog(e.bytesDownloaded, e.totalBytes);
        logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'DownloadProgress event', meta: {
          downloadId: e.downloadId,
          status: e.status,
          percent: progress.percent,
          transferred: progress.transferred,
          reason: e.reason || '',
          reasonCode: e.reasonCode || '',
        } });
      }
      this.dispatchToListeners(this.progressListeners, 'progress', e);
    }));
    push(this.eventEmitter.addListener('DownloadComplete', (e: DownloadCompleteEvent) => {
      logDownloadDebug({ level: 'log', scope: 'BackgroundDownloadService', message: 'DownloadComplete event', meta: {
        downloadId: e.downloadId,
        fileName: e.fileName,
        modelId: e.modelId,
        localUri: e.localUri || '',
      } });
      this.dispatchToListeners(this.completeListeners, 'complete', e);
    }));
    push(this.eventEmitter.addListener('DownloadError', (e: DownloadErrorEvent) => {
      logDownloadDebug({ level: 'error', scope: 'BackgroundDownloadService', message: 'DownloadError event', meta: {
        downloadId: e.downloadId,
        fileName: e.fileName,
        modelId: e.modelId,
        reason: e.reason || '',
        reasonCode: e.reasonCode || '',
        status: e.status,
      } });
      this.dispatchToListeners(this.errorListeners, 'error', e);
    }));
    // DownloadRetrying — worker hit a transient error and will retry automatically.
    // Route it as a progress event with status='retrying' so the UI shows
    // "Retrying..." instead of surfacing a false error to the user.
    push(this.eventEmitter.addListener('DownloadRetrying', (e: {
      downloadId: number; fileName: string; modelId: string; reason: string; reasonCode?: string; attempt: number; status?: BackgroundDownloadStatus;
    }) => {
      logDownloadDebug({ level: 'warn', scope: 'BackgroundDownloadService', message: 'DownloadRetrying event', meta: {
        downloadId: e.downloadId,
        fileName: e.fileName,
        modelId: e.modelId,
        reason: e.reason,
        reasonCode: e.reasonCode || '',
        attempt: e.attempt + 1,
      } });
      const retryEvent: DownloadProgressEvent = {
        downloadId: e.downloadId,
        fileName: e.fileName,
        modelId: e.modelId,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: e.status || 'retrying',
        reason: e.reason,
        reasonCode: e.reasonCode as any,
      };
      this.dispatchToListeners(this.progressListeners, 'progress', retryEvent);
    }));
  }
}
export const backgroundDownloadService = new BackgroundDownloadService();
