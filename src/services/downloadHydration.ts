import { backgroundDownloadService } from './backgroundDownloadService';
import { useDownloadStore, DownloadEntry, DownloadStatus, ModelType } from '../stores/downloadStore';
import { makeModelKey, ModelKey } from '../utils/modelKey';
import { BackgroundDownloadStatus } from '../types';

type NativeDownloadRow = {
  downloadId: string;
  modelId?: string;
  modelKey?: string;
  fileName: string;
  quantization?: string;
  modelType?: ModelType;
  status: BackgroundDownloadStatus;
  bytesDownloaded?: number;
  totalBytes?: number;
  combinedTotalBytes?: number;
  mmProjDownloadId?: string;
  reason?: string;
  createdAt?: number;
  metadataJson?: string;
};

export function isMmProjFileName(fileName: string): boolean {
  return /-mmproj\.gguf$/i.test(fileName);
}

function mapNativeStatus(status: BackgroundDownloadStatus): DownloadStatus {
  switch (status) {
    case 'running': return 'running';
    case 'retrying': return 'retrying';
    case 'waiting_for_network': return 'waiting_for_network';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    default: return 'pending';
  }
}

function computeProgress(
  downloadedBytes: number,
  totalBytes: number,
  combinedTotalBytes: number,
): number {
  const denom = combinedTotalBytes || totalBytes;
  if (denom <= 0) return 0;
  return downloadedBytes / denom;
}

function getMmProjIds(rows: NativeDownloadRow[]): Set<string> {
  return new Set<string>(
    rows
      .filter(r => r.mmProjDownloadId != null)
      .map(r => r.mmProjDownloadId!),
  );
}

function getParentRows(rows: NativeDownloadRow[], mmProjIds: Set<string>): NativeDownloadRow[] {
  return rows.filter(r =>
    !mmProjIds.has(r.downloadId) &&
    !isMmProjFileName(r.fileName) &&
    r.status !== 'cancelled' &&
    r.status !== 'completed',
  );
}

function getLatestRowsByKey(rows: NativeDownloadRow[]): Map<ModelKey, NativeDownloadRow> {
  const latestByKey = new Map<ModelKey, NativeDownloadRow>();
  for (const row of rows) {
    const key: ModelKey = row.modelKey ?? makeModelKey(row.modelId ?? '', row.fileName);
    const existing = latestByKey.get(key);
    if (!existing || (row.createdAt ?? 0) > (existing.createdAt ?? 0)) {
      latestByKey.set(key, row);
    }
  }
  return latestByKey;
}

function toDownloadEntry(
  modelKey: ModelKey,
  row: NativeDownloadRow,
  rows: NativeDownloadRow[],
): DownloadEntry {
  const mmProjRow = row.mmProjDownloadId
    ? rows.find(r => r.downloadId === row.mmProjDownloadId)
    : undefined;

  const mmProjBytes = mmProjRow?.bytesDownloaded ?? 0;
  const combinedTotal = row.combinedTotalBytes || row.totalBytes || 0;
  const downloadedBytes = (row.bytesDownloaded ?? 0) + mmProjBytes;

  return {
    modelKey,
    downloadId: row.downloadId,
    modelId: row.modelId ?? '',
    fileName: row.fileName,
    quantization: row.quantization ?? 'Unknown',
    modelType: row.modelType ?? 'text',
    status: mapNativeStatus(row.status),
    bytesDownloaded: row.bytesDownloaded ?? 0,
    totalBytes: row.totalBytes ?? 0,
    combinedTotalBytes: combinedTotal,
    progress: computeProgress(downloadedBytes, row.totalBytes ?? 0, combinedTotal),
    mmProjDownloadId: row.mmProjDownloadId ?? undefined,
    mmProjBytesDownloaded: mmProjRow ? mmProjBytes : undefined,
    mmProjStatus: mmProjRow ? mapNativeStatus(mmProjRow.status) : undefined,
    errorMessage: row.reason || undefined,
    createdAt: row.createdAt ?? 0,
    metadataJson: row.metadataJson ?? undefined,
  };
}

export async function hydrateDownloadStore(): Promise<void> {
  if (!backgroundDownloadService.isAvailable()) return;

  const rows = await backgroundDownloadService.getActiveDownloads() as NativeDownloadRow[];
  const mmProjIds = getMmProjIds(rows);
  const parentRows = getParentRows(rows, mmProjIds);
  const latestByKey = getLatestRowsByKey(parentRows);
  const entries = Array.from(latestByKey.entries(), ([modelKey, row]) =>
    toDownloadEntry(modelKey, row, rows),
  );

  useDownloadStore.getState().hydrate(entries);
}
