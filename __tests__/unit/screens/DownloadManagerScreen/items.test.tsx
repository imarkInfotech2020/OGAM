import { buildDownloadItems } from '../../../../src/screens/DownloadManagerScreen/items';

jest.mock('../../../../src/services', () => ({
  hardwareService: {
    getModelTotalSize: jest.fn((model: any) => model?.fileSize || 0),
  },
}));

describe('buildDownloadItems', () => {
  it('attaches the matching background downloadId to progress-backed active items', () => {
    const items = buildDownloadItems({
      downloadProgress: {
        'author/model/file.gguf': {
          progress: 0.5,
          bytesDownloaded: 500,
          totalBytes: 1000,
        },
      },
      activeDownloads: [
        {
          downloadId: 42,
          fileName: 'file.gguf',
          modelId: 'author/model',
          status: 'running',
          bytesDownloaded: 500,
          totalBytes: 1000,
          startedAt: Date.now(),
        },
      ],
      activeBackgroundDownloads: {
        42: {
          modelId: 'author/model',
          fileName: 'file.gguf',
          author: 'author',
          quantization: 'Q4_K_M',
          totalBytes: 1000,
        },
      },
      downloadedModels: [],
      downloadedImageModels: [],
    });

    expect(items).toHaveLength(1);
    expect(items[0].downloadId).toBe(42);
  });
});
