import { Platform } from 'react-native';
import {
  downloadHuggingFaceModel,
  downloadCoreMLMultiFile,
  proceedWithDownload,
  handleDownloadImageModel,
  ImageDownloadDeps,
} from '../../../../src/screens/ModelsScreen/imageDownloadActions';
import { ImageModelDescriptor } from '../../../../src/screens/ModelsScreen/types';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('react-native-fs', () => ({
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-zip-archive', () => ({
  unzip: jest.fn(() => Promise.resolve('/extracted')),
}));

jest.mock('../../../../src/components/CustomAlert', () => ({
  showAlert: jest.fn((...args: any[]) => ({ visible: true, title: args[0], message: args[1], buttons: args[2] })),
  hideAlert: jest.fn(() => ({ visible: false })),
}));

const mockGetImageModelsDirectory = jest.fn(() => '/mock/image-models');
const mockAddDownloadedImageModel = jest.fn((_m?: any) => Promise.resolve());
const mockGetActiveBackgroundDownloads = jest.fn(() => Promise.resolve([]));

jest.mock('../../../../src/services', () => ({
  modelManager: {
    getImageModelsDirectory: () => mockGetImageModelsDirectory(),
    addDownloadedImageModel: (m: any) => mockAddDownloadedImageModel(m),
    getActiveBackgroundDownloads: () => mockGetActiveBackgroundDownloads(),
  },
  hardwareService: {
    getSoCInfo: jest.fn(() => Promise.resolve({ hasNPU: true, qnnVariant: '8gen2' })),
  },
  backgroundDownloadService: {
    isAvailable: jest.fn(() => true),
    startDownload: jest.fn(() => Promise.resolve({ downloadId: 42 })),
    startMultiFileDownload: jest.fn(() => Promise.resolve({ downloadId: 99 })),
    downloadFileTo: jest.fn(() => ({
      promise: Promise.resolve(),
    })),
    onProgress: jest.fn(() => jest.fn()),
    onComplete: jest.fn((_id: number, cb: Function) => {
      // Store callback for manual invocation in tests
      (mockOnCompleteCallbacks as any[]).push(cb);
      return jest.fn();
    }),
    onError: jest.fn((_id: number, cb: Function) => {
      (mockOnErrorCallbacks as any[]).push(cb);
      return jest.fn();
    }),
    moveCompletedDownload: jest.fn(() => Promise.resolve()),
    startProgressPolling: jest.fn(),
  },
}));

jest.mock('../../../../src/utils/coreMLModelUtils', () => ({
  resolveCoreMLModelDir: jest.fn((path: string) => Promise.resolve(path)),
  downloadCoreMLTokenizerFiles: jest.fn(() => Promise.resolve()),
}));

let mockOnCompleteCallbacks: Function[] = [];
let mockOnErrorCallbacks: Function[] = [];

// ============================================================================
// Helpers
// ============================================================================

function makeDeps(overrides: Partial<ImageDownloadDeps> = {}): ImageDownloadDeps {
  return {
    addImageModelDownloading: jest.fn(),
    removeImageModelDownloading: jest.fn(),
    updateModelProgress: jest.fn(),
    clearModelProgress: jest.fn(),
    addDownloadedImageModel: jest.fn(),
    activeImageModelId: null,
    setActiveImageModelId: jest.fn(),
    setImageModelDownloadId: jest.fn(),
    setBackgroundDownload: jest.fn(),
    setAlertState: jest.fn(),
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

// ============================================================================
// Tests
// ============================================================================

describe('imageDownloadActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnCompleteCallbacks = [];
    mockOnErrorCallbacks = [];
  });

  // ==========================================================================
  // downloadHuggingFaceModel
  // ==========================================================================
  describe('downloadHuggingFaceModel', () => {
    it('shows error when huggingFaceRepo is missing', async () => {
      const deps = makeDeps();
      const model = makeHFModelInfo({ huggingFaceRepo: undefined, huggingFaceFiles: undefined });

      await downloadHuggingFaceModel(model, deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error' }),
      );
      expect(deps.addImageModelDownloading).not.toHaveBeenCalled();
    });

    it('shows error when huggingFaceFiles is missing', async () => {
      const deps = makeDeps();
      const model = makeHFModelInfo({ huggingFaceFiles: undefined });

      await downloadHuggingFaceModel(model, deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error' }),
      );
    });

    it('downloads all files and registers model on success', async () => {
      const deps = makeDeps();
      const model = makeHFModelInfo();

      await downloadHuggingFaceModel(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalledWith('test-hf-model');
      expect(deps.updateModelProgress).toHaveBeenCalled();
      expect(mockAddDownloadedImageModel).toHaveBeenCalled();
      expect(deps.addDownloadedImageModel).toHaveBeenCalled();
      expect(deps.removeImageModelDownloading).toHaveBeenCalledWith('test-hf-model');
      expect(deps.clearModelProgress).toHaveBeenCalledWith('test-hf-model');
      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Success' }),
      );
    });

    it('sets active image model when none is active', async () => {
      const deps = makeDeps({ activeImageModelId: null });
      const model = makeHFModelInfo();

      await downloadHuggingFaceModel(model, deps);

      expect(deps.setActiveImageModelId).toHaveBeenCalledWith('test-hf-model');
    });

    it('does not override active image model if one already set', async () => {
      const deps = makeDeps({ activeImageModelId: 'existing-model' });
      const model = makeHFModelInfo();

      await downloadHuggingFaceModel(model, deps);

      expect(deps.setActiveImageModelId).not.toHaveBeenCalled();
    });

    it('cleans up and shows error on download failure', async () => {
      const { backgroundDownloadService } = require('../../../../src/services');
      backgroundDownloadService.downloadFileTo.mockReturnValueOnce({
        promise: Promise.reject(new Error('Network failed')),
      });

      const deps = makeDeps();
      const model = makeHFModelInfo();

      await downloadHuggingFaceModel(model, deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Download Failed' }),
      );
      expect(deps.removeImageModelDownloading).toHaveBeenCalledWith('test-hf-model');
      expect(deps.clearModelProgress).toHaveBeenCalledWith('test-hf-model');
    });
  });

  // ==========================================================================
  // downloadCoreMLMultiFile
  // ==========================================================================
  describe('downloadCoreMLMultiFile', () => {
    it('shows alert when background downloads not available', async () => {
      const { backgroundDownloadService } = require('../../../../src/services');
      backgroundDownloadService.isAvailable.mockReturnValueOnce(false);

      const deps = makeDeps();
      await downloadCoreMLMultiFile(makeCoreMLModelInfo(), deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Not Available' }),
      );
      expect(deps.addImageModelDownloading).not.toHaveBeenCalled();
    });

    it('returns early when coremlFiles is empty', async () => {
      const deps = makeDeps();
      await downloadCoreMLMultiFile(makeCoreMLModelInfo({ coremlFiles: [] }), deps);

      expect(deps.addImageModelDownloading).not.toHaveBeenCalled();
    });

    it('starts multi-file download and sets up listeners', async () => {
      const { backgroundDownloadService } = require('../../../../src/services');
      const deps = makeDeps();

      await downloadCoreMLMultiFile(makeCoreMLModelInfo(), deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalledWith('test-coreml-model');
      expect(backgroundDownloadService.startMultiFileDownload).toHaveBeenCalled();
      expect(deps.setImageModelDownloadId).toHaveBeenCalledWith('test-coreml-model', 99);
      expect(deps.setBackgroundDownload).toHaveBeenCalledWith(99, expect.any(Object));
      expect(backgroundDownloadService.onProgress).toHaveBeenCalledWith(99, expect.any(Function));
      expect(backgroundDownloadService.onComplete).toHaveBeenCalledWith(99, expect.any(Function));
      expect(backgroundDownloadService.onError).toHaveBeenCalledWith(99, expect.any(Function));
      expect(backgroundDownloadService.startProgressPolling).toHaveBeenCalled();
    });

    it('handles completion callback', async () => {
      const deps = makeDeps();
      await downloadCoreMLMultiFile(makeCoreMLModelInfo(), deps);

      // Trigger the complete callback
      expect(mockOnCompleteCallbacks.length).toBe(1);
      await mockOnCompleteCallbacks[0]();

      expect(mockAddDownloadedImageModel).toHaveBeenCalled();
      expect(deps.addDownloadedImageModel).toHaveBeenCalled();
      expect(deps.removeImageModelDownloading).toHaveBeenCalledWith('test-coreml-model');
      expect(deps.clearModelProgress).toHaveBeenCalledWith('test-coreml-model');
      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Success' }),
      );
    });

    it('handles error callback', async () => {
      const deps = makeDeps();
      await downloadCoreMLMultiFile(makeCoreMLModelInfo(), deps);

      expect(mockOnErrorCallbacks.length).toBe(1);
      mockOnErrorCallbacks[0]({ reason: 'Disk full' });

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Download Failed' }),
      );
      expect(deps.removeImageModelDownloading).toHaveBeenCalledWith('test-coreml-model');
      expect(deps.clearModelProgress).toHaveBeenCalledWith('test-coreml-model');
    });

    it('handles exception during startMultiFileDownload', async () => {
      const { backgroundDownloadService } = require('../../../../src/services');
      backgroundDownloadService.startMultiFileDownload.mockRejectedValueOnce(new Error('Native crash'));

      const deps = makeDeps();
      await downloadCoreMLMultiFile(makeCoreMLModelInfo(), deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Download Failed' }),
      );
      expect(deps.removeImageModelDownloading).toHaveBeenCalledWith('test-coreml-model');
    });
  });

  // ==========================================================================
  // proceedWithDownload
  // ==========================================================================
  describe('proceedWithDownload', () => {
    it('delegates to downloadHuggingFaceModel for HF models', async () => {
      const deps = makeDeps();
      const model = makeHFModelInfo();

      await proceedWithDownload(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalledWith('test-hf-model');
    });

    it('delegates to downloadCoreMLMultiFile for CoreML models', async () => {
      const deps = makeDeps();
      const model = makeCoreMLModelInfo();

      await proceedWithDownload(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalledWith('test-coreml-model');
    });

    it('uses background download service for zip models', async () => {
      const { backgroundDownloadService } = require('../../../../src/services');
      const deps = makeDeps();
      const model = makeZipModelInfo();

      await proceedWithDownload(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalledWith('test-zip-model');
      expect(backgroundDownloadService.startDownload).toHaveBeenCalled();
      expect(deps.setImageModelDownloadId).toHaveBeenCalledWith('test-zip-model', 42);
    });

    it('handles zip download completion with unzip', async () => {
      const deps = makeDeps();
      const model = makeZipModelInfo();

      await proceedWithDownload(model, deps);

      // Trigger completion
      expect(mockOnCompleteCallbacks.length).toBe(1);
      await mockOnCompleteCallbacks[0]();

      expect(mockAddDownloadedImageModel).toHaveBeenCalled();
      expect(deps.addDownloadedImageModel).toHaveBeenCalled();
      expect(deps.removeImageModelDownloading).toHaveBeenCalledWith('test-zip-model');
      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Success' }),
      );
    });

    it('handles zip download error callback', async () => {
      const deps = makeDeps();
      const model = makeZipModelInfo();

      await proceedWithDownload(model, deps);

      expect(mockOnErrorCallbacks.length).toBe(1);
      mockOnErrorCallbacks[0]({ reason: 'Connection lost' });

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Download Failed' }),
      );
      expect(deps.removeImageModelDownloading).toHaveBeenCalled();
    });

    it('handles startDownload exception for zip models', async () => {
      const { backgroundDownloadService } = require('../../../../src/services');
      backgroundDownloadService.startDownload.mockRejectedValueOnce(new Error('Storage full'));

      const deps = makeDeps();
      await proceedWithDownload(makeZipModelInfo(), deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Download Failed' }),
      );
      expect(deps.removeImageModelDownloading).toHaveBeenCalled();
    });

    it('sets active model on zip download completion when none active', async () => {
      const deps = makeDeps({ activeImageModelId: null });
      const model = makeZipModelInfo();

      await proceedWithDownload(model, deps);
      await mockOnCompleteCallbacks[0]();

      expect(deps.setActiveImageModelId).toHaveBeenCalled();
    });

    it('does not set active model on zip download when one already active', async () => {
      const deps = makeDeps({ activeImageModelId: 'existing' });
      const model = makeZipModelInfo();

      await proceedWithDownload(model, deps);
      await mockOnCompleteCallbacks[0]();

      expect(deps.setActiveImageModelId).not.toHaveBeenCalled();
    });

    it('handles extraction failure on zip download completion', async () => {
      const { unzip } = require('react-native-zip-archive');
      unzip.mockRejectedValueOnce(new Error('Corrupt zip'));

      const deps = makeDeps();
      await proceedWithDownload(makeZipModelInfo(), deps);
      await mockOnCompleteCallbacks[0]();

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Download Failed' }),
      );
      expect(deps.removeImageModelDownloading).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // handleDownloadImageModel
  // ==========================================================================
  describe('handleDownloadImageModel', () => {
    const originalPlatform = Platform.OS;

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatform });
    });

    it('proceeds directly for non-QNN models', async () => {
      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'mnn' });

      await handleDownloadImageModel(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalled();
    });

    it('proceeds directly for QNN on non-Android', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios' });
      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'qnn' });

      await handleDownloadImageModel(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalled();
    });

    it('shows warning for QNN on device without NPU', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      const { hardwareService } = require('../../../../src/services');
      hardwareService.getSoCInfo.mockResolvedValueOnce({ hasNPU: false });

      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'qnn' });

      await handleDownloadImageModel(model, deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Incompatible Model',
          buttons: expect.arrayContaining([
            expect.objectContaining({ text: 'Cancel' }),
            expect.objectContaining({ text: 'Download Anyway' }),
          ]),
        }),
      );
      // Should not start download
      expect(deps.addImageModelDownloading).not.toHaveBeenCalled();
    });

    it('shows warning for incompatible QNN variant', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      const { hardwareService } = require('../../../../src/services');
      hardwareService.getSoCInfo.mockResolvedValueOnce({
        hasNPU: true,
        qnnVariant: 'min',
      });

      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'qnn', variant: '8gen2' });

      await handleDownloadImageModel(model, deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Incompatible Model' }),
      );
    });

    it('proceeds for compatible QNN variant on Android', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      const { hardwareService } = require('../../../../src/services');
      hardwareService.getSoCInfo.mockResolvedValueOnce({
        hasNPU: true,
        qnnVariant: '8gen2',
      });

      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'qnn', variant: '8gen2' });

      await handleDownloadImageModel(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalled();
    });

    it('8gen2 device is compatible with all model variants', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      const { hardwareService } = require('../../../../src/services');
      hardwareService.getSoCInfo.mockResolvedValueOnce({
        hasNPU: true,
        qnnVariant: '8gen2',
      });

      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'qnn', variant: 'min' });

      await handleDownloadImageModel(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalled();
    });

    it('proceeds for QNN with NPU but no variant info', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      const { hardwareService } = require('../../../../src/services');
      hardwareService.getSoCInfo.mockResolvedValueOnce({
        hasNPU: true,
        qnnVariant: undefined,
      });

      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'qnn' });

      await handleDownloadImageModel(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalled();
    });

    it('8gen1 device is incompatible with 8gen2 model variant', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      const { hardwareService } = require('../../../../src/services');
      hardwareService.getSoCInfo.mockResolvedValueOnce({
        hasNPU: true,
        qnnVariant: '8gen1',
      });

      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'qnn', variant: '8gen2' });

      await handleDownloadImageModel(model, deps);

      expect(deps.setAlertState).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Incompatible Model' }),
      );
    });

    it('8gen1 device is compatible with non-8gen2 model variants', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      const { hardwareService } = require('../../../../src/services');
      hardwareService.getSoCInfo.mockResolvedValueOnce({
        hasNPU: true,
        qnnVariant: '8gen1',
      });

      const deps = makeDeps();
      const model = makeZipModelInfo({ backend: 'qnn', variant: 'min' });

      await handleDownloadImageModel(model, deps);

      expect(deps.addImageModelDownloading).toHaveBeenCalled();
    });
  });
});
