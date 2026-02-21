/**
 * restoreInProgressDownloads Unit Tests
 *
 * Tests for the download-restoration logic that re-wires background download
 * context after an app restart. Without this, in-progress downloads would be
 * forgotten and the UI would never receive completion events.
 */

import { restoreInProgressDownloads } from '../../../src/services/modelManager/restore';
import { backgroundDownloadService } from '../../../src/services/backgroundDownloadService';
import { PersistedDownloadInfo } from '../../../src/types';
import { BackgroundDownloadContext } from '../../../src/services/modelManager/types';

jest.mock('../../../src/services/backgroundDownloadService', () => ({
  backgroundDownloadService: {
    isAvailable: jest.fn(() => true),
    getActiveDownloads: jest.fn(() => Promise.resolve([])),
    onProgress: jest.fn(() => jest.fn()),
  },
}));

const mockService = backgroundDownloadService as jest.Mocked<typeof backgroundDownloadService>;

const MODELS_DIR = '/mock/documents/models';

function makePersistedInfo(overrides: Partial<PersistedDownloadInfo> = {}): PersistedDownloadInfo {
  return {
    modelId: 'test/model',
    fileName: 'model.gguf',
    quantization: 'Q4_K_M',
    author: 'test',
    totalBytes: 4_000_000_000,
    ...overrides,
  };
}

function makeActiveDownload(overrides: Partial<{
  downloadId: number;
  status: string;
  fileName: string;
  modelId: string;
  bytesDownloaded: number;
  totalBytes: number;
}> = {}) {
  return {
    downloadId: 42,
    status: 'running',
    fileName: 'model.gguf',
    modelId: 'test/model',
    bytesDownloaded: 0,
    totalBytes: 4_000_000_000,
    startedAt: Date.now(),
    ...overrides,
  };
}

describe('restoreInProgressDownloads', () => {
  let bgContext: Map<number, BackgroundDownloadContext>;
  let metadataCallback: jest.Mock;
  let onProgress: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    bgContext = new Map();
    metadataCallback = jest.fn();
    onProgress = jest.fn();
    mockService.isAvailable.mockReturnValue(true);
    mockService.getActiveDownloads.mockResolvedValue([]);
    mockService.onProgress.mockReturnValue(jest.fn());
  });

  // ========================================================================
  // Guard: service unavailable
  // ========================================================================

  it('returns early without querying when service is unavailable', async () => {
    mockService.isAvailable.mockReturnValue(false);

    await restoreInProgressDownloads({
      persistedDownloads: {},
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });

    expect(mockService.getActiveDownloads).not.toHaveBeenCalled();
    expect(bgContext.size).toBe(0);
  });

  // ========================================================================
  // Filtering: status gating
  // ========================================================================

  it('skips completed downloads', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ status: 'completed' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });
    expect(bgContext.size).toBe(0);
  });

  it('skips failed downloads', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ status: 'failed' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });
    expect(bgContext.size).toBe(0);
  });

  it('skips unknown status downloads', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ status: 'unknown' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });
    expect(bgContext.size).toBe(0);
  });

  it('processes running downloads', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ status: 'running' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });
    expect(bgContext.size).toBe(1);
  });

  it('processes pending downloads', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ status: 'pending' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });
    expect(bgContext.size).toBe(1);
  });

  it('processes paused downloads', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ status: 'paused' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });
    expect(bgContext.size).toBe(1);
  });

  // ========================================================================
  // Filtering: metadata matching
  // ========================================================================

  it('skips download with no matching persisted metadata', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42 }) as any,
    ]);
    // persistedDownloads has downloadId 99, not 42
    await restoreInProgressDownloads({
      persistedDownloads: { 99: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });
    expect(bgContext.size).toBe(0);
    expect(mockService.onProgress).not.toHaveBeenCalled();
  });

  it('skips download already present in backgroundDownloadContext', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42 }) as any,
    ]);
    // Pre-populate context
    bgContext.set(42, { modelId: 'test/model', file: {} as any, localPath: '/x', mmProjLocalPath: null, removeProgressListener: jest.fn() });

    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });

    // No duplicate entry should be created
    expect(bgContext.size).toBe(1);
    expect(mockService.onProgress).not.toHaveBeenCalled();
  });

  // ========================================================================
  // Context wiring
  // ========================================================================

  it('sets correct localPath in context', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 55, fileName: 'vision.gguf' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: { 55: makePersistedInfo({ fileName: 'vision.gguf' }) },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
    });

    const ctx = bgContext.get(55) as any;
    expect(ctx.localPath).toBe(`${MODELS_DIR}/vision.gguf`);
  });

  it('sets mmProjLocalPath from persisted metadata', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 55 }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: {
        55: makePersistedInfo({
          mmProjFileName: 'mmproj.gguf',
          mmProjLocalPath: `${MODELS_DIR}/mmproj.gguf`,
        }),
      },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
    });

    const ctx = bgContext.get(55) as any;
    expect(ctx.mmProjLocalPath).toBe(`${MODELS_DIR}/mmproj.gguf`);
  });

  it('sets mmProjLocalPath to null when not in persisted metadata', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 77 }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: { 77: makePersistedInfo() }, // no mmProjLocalPath
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
    });

    const ctx = bgContext.get(77) as any;
    expect(ctx.mmProjLocalPath).toBeNull();
  });

  it('stores modelId and file info in context', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42 }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: {
        42: makePersistedInfo({ modelId: 'org/specific-model', fileName: 'specific.gguf', quantization: 'Q5_K_M' }),
      },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
    });

    const ctx = bgContext.get(42) as any;
    expect(ctx.modelId).toBe('org/specific-model');
    expect(ctx.file.name).toBe('specific.gguf');
    expect(ctx.file.quantization).toBe('Q5_K_M');
  });

  it('registers progress listener for the download', async () => {
    const removeProgressFn = jest.fn();
    mockService.onProgress.mockReturnValue(removeProgressFn);
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42 }) as any,
    ]);

    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
    });

    expect(mockService.onProgress).toHaveBeenCalledWith(42, expect.any(Function));
    const ctx = bgContext.get(42) as any;
    expect(ctx.removeProgressListener).toBe(removeProgressFn);
  });

  // ========================================================================
  // Metadata callback
  // ========================================================================

  it('calls metadata callback with persisted info', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42 }) as any,
    ]);
    const info = makePersistedInfo({ totalBytes: 5_000_000_000 });
    await restoreInProgressDownloads({
      persistedDownloads: { 42: info },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });

    expect(metadataCallback).toHaveBeenCalledWith(42, expect.objectContaining({
      modelId: 'test/model',
      fileName: 'model.gguf',
      totalBytes: 5_000_000_000,
    }));
  });

  it('does not throw when metadataCallback is null', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42 }) as any,
    ]);
    await expect(restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
    })).resolves.toBeUndefined();
  });

  // ========================================================================
  // Progress callback forwarding
  // ========================================================================

  it('forwards progress events to onProgress callback with combined totalBytes', async () => {
    let capturedHandler: ((event: any) => void) | null = null;
    mockService.onProgress.mockImplementation((_id: number, handler: any) => {
      capturedHandler = handler;
      return jest.fn();
    });
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42 }) as any,
    ]);

    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo({ totalBytes: 4_500_000_000 }) },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
      onProgress,
    });

    capturedHandler!({
      downloadId: 42,
      bytesDownloaded: 2_000_000_000,
      totalBytes: 4_000_000_000,
      status: 'running',
      fileName: 'model.gguf',
      modelId: 'test/model',
    });

    expect(onProgress).toHaveBeenCalledWith({
      modelId: 'test/model',
      fileName: 'model.gguf',
      bytesDownloaded: 2_000_000_000,
      totalBytes: 4_500_000_000, // uses combined stored totalBytes
      progress: expect.closeTo(2_000_000_000 / 4_500_000_000, 5),
    });
  });

  it('reports zero progress when totalBytes is zero', async () => {
    let capturedHandler: ((event: any) => void) | null = null;
    mockService.onProgress.mockImplementation((_id: number, handler: any) => {
      capturedHandler = handler;
      return jest.fn();
    });
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42, totalBytes: 0 }) as any,
    ]);

    await restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo({ totalBytes: 0 }) },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
      onProgress,
    });

    capturedHandler!({
      downloadId: 42, bytesDownloaded: 500, totalBytes: 0,
      status: 'running', fileName: 'model.gguf', modelId: 'test/model',
    });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ progress: 0 }));
  });

  it('does not throw when onProgress is undefined', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 42 }) as any,
    ]);
    await expect(restoreInProgressDownloads({
      persistedDownloads: { 42: makePersistedInfo() },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: null,
      // onProgress omitted
    })).resolves.toBeUndefined();
  });

  // ========================================================================
  // Multiple downloads
  // ========================================================================

  it('restores multiple in-progress downloads independently', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 10, fileName: 'model-a.gguf' }) as any,
      makeActiveDownload({ downloadId: 20, fileName: 'model-b.gguf' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: {
        10: makePersistedInfo({ fileName: 'model-a.gguf' }),
        20: makePersistedInfo({ fileName: 'model-b.gguf' }),
      },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });

    expect(bgContext.size).toBe(2);
    expect(bgContext.has(10)).toBe(true);
    expect(bgContext.has(20)).toBe(true);
    expect(mockService.onProgress).toHaveBeenCalledTimes(2);
    expect(metadataCallback).toHaveBeenCalledTimes(2);
  });

  it('skips already-completed entry while restoring other running entries', async () => {
    mockService.getActiveDownloads.mockResolvedValue([
      makeActiveDownload({ downloadId: 10, status: 'completed' }) as any,
      makeActiveDownload({ downloadId: 20, status: 'running' }) as any,
    ]);
    await restoreInProgressDownloads({
      persistedDownloads: {
        10: makePersistedInfo({ fileName: 'a.gguf' }),
        20: makePersistedInfo({ fileName: 'b.gguf' }),
      },
      modelsDir: MODELS_DIR,
      backgroundDownloadContext: bgContext,
      backgroundDownloadMetadataCallback: metadataCallback,
    });

    expect(bgContext.size).toBe(1);
    expect(bgContext.has(20)).toBe(true);
  });
});
