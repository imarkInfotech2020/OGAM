import { describe, it, expect } from '@jest/globals';

type DownloadEntry = {
  progress: number;
  bytesDownloaded: number;
  combinedTotalBytes: number;
  status: string;
  mmProjBytesDownloaded?: number;
};

type ModelFile = {
  name: string;
  size: number;
};

/**
 * Helper to replicate the size-mismatch logic from getFileCardState in TextModelsTab.tsx
 */
function getProgressFromEntry(
  entry: DownloadEntry | undefined,
  itemSize: number
): {
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: string;
} | undefined {
  if (!entry) return undefined;

  const progress = {
    progress: entry.progress,
    bytesDownloaded: entry.bytesDownloaded + (entry.mmProjBytesDownloaded ?? 0),
    totalBytes: entry.combinedTotalBytes,
    status: entry.status,
  };

  // For completed downloads, discard if size doesn't match expected
  if (progress && progress.status === 'completed' && progress.bytesDownloaded < itemSize) {
    return undefined;
  }

  return progress;
}

describe('getFileCardState size-mismatch filter', () => {
  it('should keep progress for completed download with matching size', () => {
    const entry: DownloadEntry = {
      progress: 1,
      bytesDownloaded: 4000000000, // 4GB
      combinedTotalBytes: 4000000000,
      status: 'completed',
    };
    const itemSize = 4000000000;

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeDefined();
    expect(result?.status).toBe('completed');
  });

  it('should discard progress for completed download with fewer bytes than expected', () => {
    const entry: DownloadEntry = {
      progress: 0.02, // 2%
      bytesDownloaded: 21700000, // 21.7MB
      combinedTotalBytes: 1000000000,
      status: 'completed',
    };
    const itemSize = 969700000; // 969.7MB expected

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeUndefined();
  });

  it('should keep progress for incomplete download with fewer bytes', () => {
    const entry: DownloadEntry = {
      progress: 0.25, // 25%
      bytesDownloaded: 250000000, // 250MB
      combinedTotalBytes: 1000000000,
      status: 'downloading',
    };
    const itemSize = 1000000000;

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeDefined();
    expect(result?.status).toBe('downloading');
  });

  it('should keep progress for failed download', () => {
    const entry: DownloadEntry = {
      progress: 0.5,
      bytesDownloaded: 500000000,
      combinedTotalBytes: 1000000000,
      status: 'failed',
    };
    const itemSize = 1000000000;

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeDefined();
    expect(result?.status).toBe('failed');
  });

  it('should handle undefined entry', () => {
    const result = getProgressFromEntry(undefined, 1000000000);
    expect(result).toBeUndefined();
  });

  it('should include mmProjBytesDownloaded in total bytes', () => {
    const entry: DownloadEntry = {
      progress: 1,
      bytesDownloaded: 4000000000,
      combinedTotalBytes: 4100000000,
      status: 'completed',
      mmProjBytesDownloaded: 100000000,
    };
    const itemSize = 4100000000;

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeDefined();
    expect(result?.bytesDownloaded).toBe(4100000000);
  });

  it('should discard progress when completed with combined bytes less than expected', () => {
    const entry: DownloadEntry = {
      progress: 1,
      bytesDownloaded: 3900000000,
      combinedTotalBytes: 4000000000,
      status: 'completed',
      mmProjBytesDownloaded: 50000000, // 3900 + 50 = 3950, still less than 4GB
    };
    const itemSize = 4000000000;

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeUndefined();
  });

  it('should handle edge case: completed with bytesDownloaded exactly equal to itemSize', () => {
    const entry: DownloadEntry = {
      progress: 1,
      bytesDownloaded: 1000000000,
      combinedTotalBytes: 1000000000,
      status: 'completed',
    };
    const itemSize = 1000000000;

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeDefined();
  });

  it('should handle small files with completed status and size mismatch', () => {
    const entry: DownloadEntry = {
      progress: 1,
      bytesDownloaded: 14000000, // 14MB
      combinedTotalBytes: 1400000000,
      status: 'completed',
    };
    const itemSize = 1400000000; // 1.4GB expected

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeUndefined();
  });

  it('should keep progress for pending download', () => {
    const entry: DownloadEntry = {
      progress: 0,
      bytesDownloaded: 0,
      combinedTotalBytes: 1000000000,
      status: 'pending',
    };
    const itemSize = 1000000000;

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeDefined();
    expect(result?.status).toBe('pending');
  });

  it('should handle massive size gap: 14MB completed for 4GB file', () => {
    const entry: DownloadEntry = {
      progress: 1,
      bytesDownloaded: 14000000, // 14MB
      combinedTotalBytes: 4000000000,
      status: 'completed',
    };
    const itemSize = 4000000000; // 4GB expected

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeUndefined();
  });

  it('should discard progress for completed download even at 99% progress', () => {
    const entry: DownloadEntry = {
      progress: 0.99,
      bytesDownloaded: 990000000, // 99%
      combinedTotalBytes: 1000000000,
      status: 'completed',
    };
    const itemSize = 1000000000;

    const result = getProgressFromEntry(entry, itemSize);
    expect(result).toBeUndefined();
  });

  it('should allow re-download by discarding stuck/incomplete completed state', () => {
    // Simulate the stuck download scenario: marked as completed but actual bytes are much less
    const entry: DownloadEntry = {
      progress: 0.02, // Shows 2% progress but marked completed
      bytesDownloaded: 21700000, // Only 21.7MB downloaded
      combinedTotalBytes: 1000000000,
      status: 'completed', // Incorrectly marked as completed
    };
    const itemSize = 969700000; // Model is 969.7MB

    const result = getProgressFromEntry(entry, itemSize);
    // Result should be undefined, allowing UI to show download button instead of progress
    expect(result).toBeUndefined();
  });
});
