import { create } from 'zustand';
import { ModelKey } from '../utils/modelKey';

export type DownloadStatus =
  | 'pending'
  | 'running'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ModelType = 'text' | 'image'

export interface DownloadEntry {
  modelKey: ModelKey
  downloadId: string
  modelId: string
  fileName: string
  quantization: string
  modelType: ModelType
  status: DownloadStatus
  bytesDownloaded: number
  totalBytes: number
  combinedTotalBytes: number
  progress: number
  mmProjDownloadId?: string
  mmProjBytesDownloaded?: number
  mmProjStatus?: DownloadStatus
  errorMessage?: string
  createdAt: number
  lastProgressAt: number
  metadataJson?: string
}

export const STUCK_THRESHOLD_MS = 30_000;

interface DownloadStoreState {
  downloads: Record<ModelKey, DownloadEntry>
  downloadIdIndex: Record<string, ModelKey>

  setAll: (entries: DownloadEntry[]) => void
  add: (entry: DownloadEntry) => void
  setMmProjDownloadId: (modelKey: ModelKey, mmProjDownloadId: string) => void
  updateProgress: (downloadId: string, bytes: number, total: number) => void
  updateMmProjProgress: (mmProjDownloadId: string, bytes: number) => void
  setStatus: (downloadId: string, status: DownloadStatus, error?: { message: string; code?: string }) => void
  setProcessing: (downloadId: string) => void
  setCompleted: (downloadId: string) => void
  setMmProjCompleted: (mmProjDownloadId: string, bytes: number) => void
  retryEntry: (modelKey: ModelKey, newDownloadId: string) => void
  remove: (modelKey: ModelKey) => void
}

export const useDownloadStore = create<DownloadStoreState>((set) => ({
  downloads: {},
  downloadIdIndex: {},

  setAll: (entries) => {
    const downloads: Record<ModelKey, DownloadEntry> = {};
    const downloadIdIndex: Record<string, ModelKey> = {};
    for (const entry of entries) {
      downloads[entry.modelKey] = entry;
      downloadIdIndex[entry.downloadId] = entry.modelKey;
      if (entry.mmProjDownloadId) {
        downloadIdIndex[entry.mmProjDownloadId] = entry.modelKey;
      }
    }
    set({ downloads, downloadIdIndex });
  },

  add: (entry) => set(state => ({
    downloads: { ...state.downloads, [entry.modelKey]: entry },
    downloadIdIndex: {
      ...state.downloadIdIndex,
      [entry.downloadId]: entry.modelKey,
      ...(entry.mmProjDownloadId ? { [entry.mmProjDownloadId]: entry.modelKey } : {}),
    },
  })),

  setMmProjDownloadId: (modelKey, mmProjDownloadId) => set(state => {
    const entry = state.downloads[modelKey];
    if (!entry) return state;
    return {
      downloads: { ...state.downloads, [modelKey]: { ...entry, mmProjDownloadId } },
      downloadIdIndex: { ...state.downloadIdIndex, [mmProjDownloadId]: modelKey },
    };
  }),

  updateProgress: (downloadId, bytes, total) => set(state => {
    const modelKey = state.downloadIdIndex[downloadId];
    if (!modelKey) return state;
    const entry = state.downloads[modelKey];
    if (!entry || entry.downloadId !== downloadId) return state;
    const combinedTotal = entry.combinedTotalBytes || total;
    const mmProjBytes = entry.mmProjBytesDownloaded ?? 0;
    const progress = combinedTotal > 0 ? (bytes + mmProjBytes) / combinedTotal : 0;
    return {
      downloads: {
        ...state.downloads,
        [modelKey]: {
          ...entry,
          bytesDownloaded: bytes,
          totalBytes: total,
          progress,
          status: 'running',
          lastProgressAt: Date.now(),
        },
      },
    };
  }),

  updateMmProjProgress: (mmProjDownloadId, bytes) => set(state => {
    const modelKey = state.downloadIdIndex[mmProjDownloadId];
    if (!modelKey) return state;
    const entry = state.downloads[modelKey];
    if (!entry || entry.mmProjDownloadId !== mmProjDownloadId) return state;
    const combinedTotal = entry.combinedTotalBytes || entry.totalBytes;
    const progress = combinedTotal > 0 ? (entry.bytesDownloaded + bytes) / combinedTotal : 0;
    return {
      downloads: {
        ...state.downloads,
        [modelKey]: {
          ...entry,
          mmProjBytesDownloaded: bytes,
          progress,
          lastProgressAt: Date.now(),
        },
      },
    };
  }),

  setStatus: (downloadId, status, error) => set(state => {
    const modelKey = state.downloadIdIndex[downloadId];
    if (!modelKey) return state;
    const entry = state.downloads[modelKey];
    if (!entry) return state;
    // If mmproj fails, fail the whole entry
    const isMmProj = entry.mmProjDownloadId === downloadId;
    if (isMmProj) {
      return {
        downloads: {
          ...state.downloads,
          [modelKey]: {
            ...entry,
            status: 'failed',
            mmProjStatus: status as DownloadStatus,
            errorMessage: error?.message,
          },
        },
      };
    }
    return {
      downloads: {
        ...state.downloads,
        [modelKey]: { ...entry, status, errorMessage: error?.message },
      },
    };
  }),

  setProcessing: (downloadId) => set(state => {
    const modelKey = state.downloadIdIndex[downloadId];
    if (!modelKey) return state;
    const entry = state.downloads[modelKey];
    if (!entry) return state;
    return {
      downloads: { ...state.downloads, [modelKey]: { ...entry, status: 'processing' } },
    };
  }),

  setCompleted: (downloadId) => set(state => {
    const modelKey = state.downloadIdIndex[downloadId];
    if (!modelKey) return state;
    const entry = state.downloads[modelKey];
    if (!entry) return state;
    return {
      downloads: {
        ...state.downloads,
        [modelKey]: { ...entry, status: 'completed', progress: 1 },
      },
    };
  }),

  setMmProjCompleted: (mmProjDownloadId, bytes) => set(state => {
    const modelKey = state.downloadIdIndex[mmProjDownloadId];
    if (!modelKey) return state;
    const entry = state.downloads[modelKey];
    if (!entry || entry.mmProjDownloadId !== mmProjDownloadId) return state;
    return {
      downloads: {
        ...state.downloads,
        [modelKey]: {
          ...entry,
          mmProjBytesDownloaded: bytes,
          mmProjStatus: 'completed' as DownloadStatus,
        },
      },
    };
  }),

  retryEntry: (modelKey, newDownloadId) => set(state => {
    const entry = state.downloads[modelKey];
    if (!entry) return state;
    const newIndex = { ...state.downloadIdIndex };
    delete newIndex[entry.downloadId];
    if (entry.mmProjDownloadId) delete newIndex[entry.mmProjDownloadId];
    newIndex[newDownloadId] = modelKey;
    return {
      downloads: {
        ...state.downloads,
        [modelKey]: {
          ...entry,
          downloadId: newDownloadId,
          status: 'pending',
          bytesDownloaded: 0,
          progress: 0,
          errorMessage: undefined,
          mmProjStatus: undefined,
          mmProjBytesDownloaded: undefined,
          mmProjDownloadId: undefined,
          lastProgressAt: Date.now(),
        },
      },
      downloadIdIndex: newIndex,
    };
  }),

  remove: (modelKey) => set(state => {
    const entry = state.downloads[modelKey];
    if (!entry) return state;
    const newIndex = { ...state.downloadIdIndex };
    delete newIndex[entry.downloadId];
    if (entry.mmProjDownloadId) delete newIndex[entry.mmProjDownloadId];
    const newDownloads = { ...state.downloads };
    delete newDownloads[modelKey];
    return { downloads: newDownloads, downloadIdIndex: newIndex };
  }),
}));
