/**
 * Image download provider — list/remove/reconcile are service-level; cancel/retry
 * are injected by the UI (imageDownloadActions pulls CustomAlert, so the provider
 * must stay UI-free). Verifies list, injected-op delegation, native cancel fallback,
 * remove, and that a multi-file (no native row) interrupted download is stranded.
 */
jest.mock('../../../src/services/modelManager', () => ({ modelManager: { deleteImageModel: jest.fn(async () => {}) } }));
jest.mock('../../../src/services/activeModelService', () => ({ activeModelService: { unloadImageModel: jest.fn(async () => {}) } }));
jest.mock('../../../src/services/backgroundDownloadService', () => ({ backgroundDownloadService: { cancelDownload: jest.fn(async () => {}) } }));
jest.mock('../../../src/utils/logger', () => ({ __esModule: true, default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { imageProvider, setImageDownloadOps } from '../../../src/services/modelDownloadService/providers/imageProvider';
import { useDownloadStore } from '../../../src/stores/downloadStore';
import { useAppStore } from '../../../src/stores';
import { backgroundDownloadService } from '../../../src/services/backgroundDownloadService';

const mockBg = backgroundDownloadService as unknown as { cancelDownload: jest.Mock };

const entry = (over: any = {}) => ({
  modelKey: 'image:sdxl/m', downloadId: 'dl-img', modelId: 'image:sdxl', fileName: 'SDXL',
  quantization: '', modelType: 'image', status: 'running', bytesDownloaded: 30, totalBytes: 100,
  combinedTotalBytes: 100, progress: 0.3, createdAt: 1, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  setImageDownloadOps({});
  useDownloadStore.setState({ downloads: {}, downloadIdIndex: {} } as any);
  useAppStore.setState({ downloadedImageModels: [] } as any);
  useDownloadStore.getState().add(entry());
});

describe('imageProvider', () => {
  it('lists an in-flight image download (downloading), id without the image: prefix dup', async () => {
    const d = (await imageProvider.list()).find(x => x.id === 'image:sdxl');
    expect(d?.status).toBe('downloading');
    expect(d?.progress).toBe(0.3);
  });

  it('lists completed image models from appStore', async () => {
    useAppStore.setState({ downloadedImageModels: [{ id: 'other', name: 'Other', size: 500, modelPath: '/p' }] } as any);
    const done = (await imageProvider.list()).find(d => d.id === 'image:other');
    expect(done?.status).toBe('completed');
  });

  it('delegates cancel to the injected UI op when registered', async () => {
    const cancel = jest.fn(async () => {});
    setImageDownloadOps({ cancel });
    await imageProvider.cancel('image:sdxl');
    expect(cancel).toHaveBeenCalledWith('sdxl', expect.objectContaining({ downloadId: 'dl-img' }));
    expect(mockBg.cancelDownload).not.toHaveBeenCalled();
  });

  it('falls back to a native cancel when no UI op is registered', async () => {
    await imageProvider.cancel('image:sdxl');
    expect(mockBg.cancelDownload).toHaveBeenCalledWith('dl-img');
  });

  it('delegates retry to the injected UI op', async () => {
    const retry = jest.fn(async () => {});
    setImageDownloadOps({ retry });
    await imageProvider.retry('image:sdxl');
    expect(retry).toHaveBeenCalledWith('sdxl', expect.objectContaining({ downloadId: 'dl-img' }));
  });

  it('reconcile strands an interrupted multi-file download (no native row) as failed', async () => {
    useDownloadStore.setState({ downloads: {}, downloadIdIndex: {} } as any);
    useDownloadStore.getState().add(entry({ downloadId: 'image-multi:sdxl', status: 'processing' }));
    await imageProvider.reconcile!();
    expect(useDownloadStore.getState().downloads['image:sdxl/m'].status).toBe('failed');
  });
});
