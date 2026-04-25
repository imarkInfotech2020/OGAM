import { backgroundDownloadService } from './backgroundDownloadService';
import { useDownloadStore, DownloadEntry, DownloadStatus, ModelType } from '../stores/downloadStore';
import { makeModelKey, ModelKey } from '../utils/modelKey';
import { BackgroundDownloadStatus } from '../types';

export function isMmProjFileName(fileName: string): boolean {
  return /-mmproj\.gguf$/i.test(fileName);
}

function mapNativeStatus(status: BackgroundDownloadStatus): DownloadStatus {
  switch (status) {
    case 'running': return 'running';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    default: return 'pending';
  }
}

function computeProgress(
  bytesDownloaded: number,
  mmProjBytesDownloaded: number,
  combinedTotalBytes: number,
  totalBytes: number,
): number {
  const denom = combinedTotalBytes || totalBytes;
  if (denom <= 0) return 0;
  return (bytesDownloaded + mmProjBytesDownloaded) / denom;
}

export async function hydrateDownloadStore(): Promise<void> {
  if (!backgroundDownloadService.isAvailable()) return;

  const rows = await backgroundDownloadService.getActiveDownloads() as any[];

  // Build set of known mmproj sidecar IDs
  const mmProjIds = new Set<string>(
    rows
      .filter(r => r.mmProjDownloadId != null)
      .map(r => r.mmProjDownloadId as string),
  );

  // Parent rows only — sidecars never shown in UI.
  // Exclude terminal states; only active/in-flight entries belong in the store.
  const parentRows = rows.filter(r =>
    !mmProjIds.has(r.downloadId) &&
    !isMmProjFileName(r.fileName) &&
    r.status !== 'cancelled' &&
    r.status !== 'completed' &&
    r.status !== 'failed',
  );

  // Hydration rule: if multiple rows share modelKey, latest createdAt wins
  const latestByKey = new Map<ModelKey, typeof parentRows[0]>();
  for (const row of parentRows) {
    const key: ModelKey = row.modelKey ?? makeModelKey(row.modelId ?? '', row.fileName);
    const existing = latestByKey.get(key);
    if (!existing || (row.createdAt ?? 0) > (existing.createdAt ?? 0)) {
      latestByKey.set(key, row);
    }
  }

  const entries: DownloadEntry[] = [];
  for (const [modelKey, row] of latestByKey) {
    const mmProjRow = row.mmProjDownloadId
      ? rows.find(r => r.downloadId === row.mmProjDownloadId)
      : undefined;

    const mmProjBytes = mmProjRow?.bytesDownloaded ?? 0;
    const combinedTotal = row.combinedTotalBytes || row.totalBytes;

    entries.push({
      modelKey,
      downloadId: row.downloadId,
      modelId: row.modelId ?? '',
      fileName: row.fileName,
      quantization: row.quantization ?? 'Unknown',
      modelType: (row.modelType as ModelType) ?? 'text',
      status: mapNativeStatus(row.status),
      bytesDownloaded: row.bytesDownloaded ?? 0,
      totalBytes: row.totalBytes ?? 0,
      combinedTotalBytes: combinedTotal,
      progress: computeProgress(row.bytesDownloaded ?? 0, mmProjBytes, combinedTotal, row.totalBytes ?? 0),
      mmProjDownloadId: row.mmProjDownloadId ?? undefined,
      mmProjBytesDownloaded: mmProjRow ? mmProjBytes : undefined,
      mmProjStatus: mmProjRow ? mapNativeStatus(mmProjRow.status) : undefined,
      errorMessage: row.reason || undefined,
      createdAt: row.createdAt ?? 0,
      metadataJson: row.metadataJson ?? undefined,
    });
  }

  useDownloadStore.getState().setAll(entries);
}
