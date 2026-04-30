import { Platform } from 'react-native';
import { unzip } from 'react-native-zip-archive';
import {
  downloadHuggingFaceModel,
  downloadCoreMLMultiFile,
  proceedWithDownload,
  handleDownloadImageModel,
  registerAndNotify,
  ImageDownloadDeps,
} from '../../../../src/screens/ModelsScreen/imageDownloadActions';
import { ImageModelDescriptor } from '../../../../src/screens/ModelsScreen/types';

jest.mock('react-native-fs', () => ({
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-zip-archive', () => ({
  unzip: jest.fn(() => Promise.resolve('/unzipped')),
}));

jest.mock('../../../../src/components/CustomAlert', () => ({
  showAlert: jest.fn((...args: any[]) => ({ visible: true, title: args[0], message: args[1], buttons: args[2] })),
  hideAlert: jest.fn(() => ({ visible: false })),
}));

const mockDownloads: Record<string, any> = {};
const mockStoreApi = {
  downloads: mockDownloads,
  add: jest.fn((entry: any) => { mockDownloads[entry.modelKey] = entry; }),
  retryEntry: jest.fn((modelKey: string, downloadId: string) => {
    mockDownloads[modelKey] = { ...mockDownloads[modelKey], modelKey, downloadId, status: 'pending' };
  }),
  remove: jest.fn((modelKey: string) => { delete mockDownloads[modelKey]; }),
  updateProgress: jest.fn(),
  setProcessing: jest.fn(),
  setStatus: jest.fn(),
};

jest.mock('../../../../src/stores/downloadStore', () => ({
  useDownloadStore: Object.assign(
    jest.fn((selector?: any) => selector ? selector(mockStoreApi) : mockStoreApi),
    { getState: () => mockStoreApi },
  ),
  isActiveStatus: (status: string) => ['pending', 'running', 'retrying', 'waiting_for_network', 'processing'].includes(status),
}));

const mockGetImageModelsDirectory = jest.fn(() => '/mock/image-models');
const mockAddDownloadedImageModel = jest.fn((_m?: any) => Promise.resolve());
const mockMoveCompletedDownload = jest.fn((_id: string, _targetPath: string) => Promise.resolve('/moved.zip'));
const mockStartDownload = jest.fn((_params: any) => Promise.resolve({ downloadId: 'zip-42' }));
const mockDownloadFileTo = jest.fn((_opts: any) => ({ promise: Promise.resolve() }));
const mockOnComplete = jest.fn((_id: string, cb: Function) => { completeCallbacks.push(cb); return jest.fn(); });
const mockOnError = jest.fn((_id: string, cb: Function) => { errorCallbacks.push(cb); return jest.fn(); });
const mockGetSoCInfo = jest.fn(() => Promise.resolve({ hasNPU: true, qnnVariant: '8gen2' }));

jest.mock('../../../../src/services', () => ({
  modelManager: {
    getImageModelsDirectory: () => mockGetImageModelsDirectory(),
    addDownloadedImageModel: (m: any) => mockAddDownloadedImageModel(m),
  },
  hardwareService: {
    getSoCInfo: () => mockGetSoCInfo(),
  },
  backgroundDownloadService: {
    startDownload: (params: any) => mockStartDownload(params),
    downloadFileTo: (opts: any) => mockDownloadFileTo(opts),
    onComplete: (id: string, cb: Function) => mockOnComplete(id, cb),
    onError: (id: string, cb: Function) => mockOnError(id, cb),
    moveCompletedDownload: (id: string, targetPath: string) => mockMoveCompletedDownload(id, targetPath),
    startProgressPolling: jest.fn(),
    cancelDownload: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../../../src/utils/coreMLModelUtils', () => ({
  resolveCoreMLModelDir: jest.fn((path: string) => Promise.resolve(path)),
  downloadCoreMLTokenizerFiles: jest.fn(() => Promise.resolve()),
}));

let completeCallbacks: Function[] = [];
let errorCallbacks: Function[] = [];

function makeDeps(overrides: Partial<ImageDownloadDeps> = {}): ImageDownloadDeps {
  return {
    addDownloadedImageModel: jest.fn(),
    activeImageModelId: null,
    setActiveImageModelId: jest.fn(),
    setAlertState: jest.fn(),
    triedImageGen: true,
    ...overrides,
  };
}

function makeHFModelInfo(overrides: Partial<ImageModelDescriptor> = {}): ImageModelDescriptor {
  return {
    id: 'test-hf-model',
    name: 'Test HF Model',
    description: 'A test model',
    downloadUrl: 'https://example.com/model.zip',
    size: 1000000,
    style: 'creative',
    backend: 'mnn',
    huggingFaceRepo: 'test/repo',
    huggingFaceFiles: [
      { path: 'unet/model.onnx', size: 500000 },
      { path: 'vae/model.onnx', size: 500000 },
    ],
    ...overrides,
  };
}

function makeZipModelInfo(overrides: Partial<ImageModelDescriptor> = {}): ImageModelDescriptor {
  return {
    id: 'test-zip-model',
    name: 'Test Zip Model',
    description: 'A zip model',
    downloadUrl: 'https://example.com/model.zip',
    size: 2000000,
    style: 'creative',
    backend: 'mnn',
    ...overrides,
  };
}

function makeCoreMLModelInfo(overrides: Partial<ImageModelDescriptor> = {}): ImageModelDescriptor {
  return {
    id: 'test-coreml-model',
    name: 'Test CoreML Model',
    description: 'A CoreML model',
    downloadUrl: '',
    size: 3000000,
    style: 'photorealistic',
    backend: 'coreml',
    repo: 'apple/coreml-sd',
    coremlFiles: [
      { path: 'unet.mlmodelc', relativePath: 'unet.mlmodelc', size: 2000000, downloadUrl: 'https://example.com/unet' },
      { path: 'vae.mlmodelc', relativePath: 'vae.mlmodelc', size: 1000000, downloadUrl: 'https://example.com/vae' },
    ],
    ...overrides,
  };
}

describe('imageDownloadActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.requireMock('react-native-fs').exists.mockResolvedValue(false);
    completeCallbacks = [];
    errorCallbacks = [];
    Object.keys(mockDownloads).forEach(k => delete mockDownloads[k]);
  });

  it('downloadHuggingFaceModel writes a store entry and registers on success', async () => {
    const deps = makeDeps();

    await downloadHuggingFaceModel(makeHFModelInfo(), deps);

    expect(mockStoreApi.add).toHaveBeenCalled();
    expect(mockStoreApi.setProcessing).toHaveBeenCalled();
    expect(mockAddDownloadedImageModel).toHaveBeenCalled();
    expect(deps.addDownloadedImageModel).toHaveBeenCalled();
    expect(mockStoreApi.remove).toHaveBeenCalledWith('image:test-hf-model');
    expect(deps.setAlertState).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
  });

  it('downloadHuggingFaceModel marks failure in store on error', async () => {
    mockDownloadFileTo.mockReturnValueOnce({ promise: Promise.reject(new Error('Network failed')) });
    const deps = makeDeps();

    await downloadHuggingFaceModel(makeHFModelInfo(), deps);

    expect(mockStoreApi.setStatus).toHaveBeenCalledWith(
      'image-multi:test-hf-model',
      'failed',
      expect.objectContaining({ message: 'Network failed' }),
    );
  });

  it('downloadCoreMLMultiFile writes a store entry and registers on success', async () => {
    const deps = makeDeps();

    await downloadCoreMLMultiFile(makeCoreMLModelInfo(), deps);

    expect(mockStoreApi.add).toHaveBeenCalled();
    expect(mockStoreApi.setProcessing).toHaveBeenCalled();
    expect(mockAddDownloadedImageModel).toHaveBeenCalled();
    expect(mockStoreApi.remove).toHaveBeenCalledWith('image:test-coreml-model');
  });

  it('proceedWithDownload uses native zip flow and completes via listeners', async () => {
    const deps = makeDeps();

    await proceedWithDownload(makeZipModelInfo(), deps);

    expect(mockStartDownload).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'test-zip-model.zip',
      modelKey: 'image:test-zip-model',
      modelType: 'image',
    }));
    expect(completeCallbacks).toHaveLength(1);

    await completeCallbacks[0]();

    expect(mockStoreApi.setProcessing).toHaveBeenCalledWith('zip-42');
    expect(mockMoveCompletedDownload).toHaveBeenCalled();
    expect(unzip).toHaveBeenCalled();
    expect(mockStoreApi.remove).toHaveBeenCalledWith('image:test-zip-model');
  });

  it('proceedWithDownload keeps failed zip entry visible on error callback', async () => {
    const deps = makeDeps();

    await proceedWithDownload(makeZipModelInfo(), deps);
    expect(errorCallbacks).toHaveLength(1);

    errorCallbacks[0]({ reason: 'Connection lost' });

    expect(mockStoreApi.remove).not.toHaveBeenCalledWith('image:test-zip-model');
    expect(deps.setAlertState).toHaveBeenCalledWith(expect.objectContaining({ title: 'Download Failed' }));
  });

  it('registerAndNotify removes the active entry after registration', async () => {
    const deps = makeDeps();

    await registerAndNotify(deps, {
      imageModel: {
        id: 'img-1',
        name: 'Img 1',
        description: 'desc',
        modelPath: '/path',
        downloadedAt: new Date().toISOString(),
        size: 123,
        style: 'creative',
        backend: 'mnn',
      },
      modelName: 'Img 1',
    });

    expect(mockAddDownloadedImageModel).toHaveBeenCalled();
    expect(mockStoreApi.remove).toHaveBeenCalledWith('image:img-1');
    expect(deps.setAlertState).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
  });

  it('handleDownloadImageModel shows incompatibility alert for unsupported QNN device', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    mockGetSoCInfo.mockResolvedValueOnce({ hasNPU: false, qnnVariant: 'min' });
    const deps = makeDeps();

    await handleDownloadImageModel(makeZipModelInfo({ backend: 'qnn' }), deps);

    expect(deps.setAlertState).toHaveBeenCalledWith(expect.objectContaining({ title: 'Incompatible Model' }));
    expect(mockStartDownload).not.toHaveBeenCalled();
    Object.defineProperty(Platform, 'OS', { value: originalPlatform });
  });

  it('handleDownloadImageModel proceeds for non-QNN models', async () => {
    const deps = makeDeps();

    await handleDownloadImageModel(makeZipModelInfo({ backend: 'mnn' }), deps);

    expect(mockStartDownload).toHaveBeenCalled();
  });
});
