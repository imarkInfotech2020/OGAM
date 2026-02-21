/**
 * Download Helpers Unit Tests
 *
 * Tests for the low-level helpers in modelManager/downloadHelpers.ts:
 * - downloadMmProjBackground  — non-200 status throws, success returns size
 * - getOrphanedTextFiles      — tracks both filePath and mmProjPath
 * - getOrphanedImageDirs      — CoreML nested-path detection avoids false positives
 */

import RNFS from 'react-native-fs';
import {
  downloadMmProjBackground,
  getOrphanedTextFiles,
  getOrphanedImageDirs,
} from '../../../src/services/modelManager/downloadHelpers';
import { ModelFile, DownloadedModel, ONNXImageModel } from '../../../src/types';

const mockedRNFS = RNFS as jest.Mocked<typeof RNFS>;

const MODELS_DIR = '/mock/documents/models';
const IMAGE_MODELS_DIR = '/mock/documents/image_models';

// ============================================================================
// Helpers
// ============================================================================

function makeVisionFile(overrides: Partial<ModelFile> = {}): ModelFile {
  return {
    name: 'vision-model.gguf',
    size: 4_000_000_000,
    quantization: 'Q4_K_M',
    downloadUrl: 'https://example.com/vision.gguf',
    mmProjFile: {
      name: 'mmproj.gguf',
      size: 500_000_000,
      downloadUrl: 'https://example.com/mmproj.gguf',
    },
    ...overrides,
  };
}

function makeDownloadedModel(overrides: Partial<DownloadedModel> = {}): DownloadedModel {
  return {
    id: 'model-1',
    name: 'Model',
    author: 'test',
    filePath: `${MODELS_DIR}/model.gguf`,
    fileName: 'model.gguf',
    fileSize: 4_000_000_000,
    quantization: 'Q4_K_M',
    downloadedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeImageModel(overrides: Partial<ONNXImageModel> = {}): ONNXImageModel {
  return {
    id: 'img-1',
    name: 'Image Model',
    description: 'Test',
    modelPath: `${IMAGE_MODELS_DIR}/img-1`,
    downloadedAt: new Date().toISOString(),
    size: 2_000_000_000,
    ...overrides,
  };
}

function makeRNFSFile(name: string, path: string, size: number | string = 1000) {
  return { name, path, size, isFile: () => true, isDirectory: () => false } as any;
}

function makeRNFSDir(name: string, path: string) {
  return { name, path, size: 0, isFile: () => false, isDirectory: () => true } as any;
}

// ============================================================================
// downloadMmProjBackground
// ============================================================================

describe('downloadMmProjBackground', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedRNFS as any).unlink = jest.fn().mockResolvedValue(undefined);
  });

  it('returns mmProjSize on HTTP 200', async () => {
    mockedRNFS.downloadFile.mockReturnValue({
      jobId: 1,
      promise: Promise.resolve({ statusCode: 200, bytesWritten: 500_000_000 }),
    } as any);

    const result = await downloadMmProjBackground({
      file: makeVisionFile(),
      mmProjLocalPath: `${MODELS_DIR}/mmproj.gguf`,
      modelId: 'test/model',
      combinedTotalBytes: 4_500_000_000,
      onProgress: undefined,
    });

    expect(result).toBe(500_000_000);
    expect(RNFS.unlink).not.toHaveBeenCalled();
  });

  it('throws on HTTP 404 and unlinks partial file', async () => {
    mockedRNFS.downloadFile.mockReturnValue({
      jobId: 1,
      promise: Promise.resolve({ statusCode: 404, bytesWritten: 0 }),
    } as any);

    const mmProjPath = `${MODELS_DIR}/mmproj.gguf`;
    await expect(downloadMmProjBackground({
      file: makeVisionFile(),
      mmProjLocalPath: mmProjPath,
      modelId: 'test/model',
      combinedTotalBytes: 4_500_000_000,
      onProgress: undefined,
    })).rejects.toThrow('mmproj download failed with status 404');

    expect(RNFS.unlink).toHaveBeenCalledWith(mmProjPath);
  });

  it('throws on HTTP 500 and unlinks partial file', async () => {
    mockedRNFS.downloadFile.mockReturnValue({
      jobId: 1,
      promise: Promise.resolve({ statusCode: 500, bytesWritten: 0 }),
    } as any);

    await expect(downloadMmProjBackground({
      file: makeVisionFile(),
      mmProjLocalPath: `${MODELS_DIR}/mmproj.gguf`,
      modelId: 'test/model',
      combinedTotalBytes: 4_500_000_000,
      onProgress: undefined,
    })).rejects.toThrow('mmproj download failed with status 500');
  });

  it('returns 0 and skips download when mmProjFile is undefined', async () => {
    const fileWithoutMmProj = makeVisionFile({ mmProjFile: undefined });

    const result = await downloadMmProjBackground({
      file: fileWithoutMmProj,
      mmProjLocalPath: '',
      modelId: 'test/model',
      combinedTotalBytes: 4_000_000_000,
      onProgress: undefined,
    });

    expect(result).toBe(0);
    expect(RNFS.downloadFile).not.toHaveBeenCalled();
  });

  it('returns 0 when mmProjLocalPath is empty string', async () => {
    const result = await downloadMmProjBackground({
      file: makeVisionFile(),
      mmProjLocalPath: '', // falsy path — guard returns 0
      modelId: 'test/model',
      combinedTotalBytes: 4_000_000_000,
      onProgress: undefined,
    });

    expect(result).toBe(0);
    expect(RNFS.downloadFile).not.toHaveBeenCalled();
  });

  it('calls onProgress with bytesWritten during download', async () => {
    let capturedProgressFn: ((res: any) => void) | undefined;
    mockedRNFS.downloadFile.mockImplementation((opts: any) => {
      capturedProgressFn = opts.progress;
      return { jobId: 1, promise: Promise.resolve({ statusCode: 200, bytesWritten: 500_000_000 }) } as any;
    });

    const onProgress = jest.fn();
    await downloadMmProjBackground({
      file: makeVisionFile(),
      mmProjLocalPath: `${MODELS_DIR}/mmproj.gguf`,
      modelId: 'test/model',
      combinedTotalBytes: 4_500_000_000,
      onProgress,
    });

    capturedProgressFn?.({ bytesWritten: 250_000_000 });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      bytesDownloaded: 250_000_000,
      totalBytes: 4_500_000_000,
      progress: expect.closeTo(250_000_000 / 4_500_000_000, 5),
    }));
  });

  it('passes background:true and discretionary:true to RNFS', async () => {
    mockedRNFS.downloadFile.mockReturnValue({
      jobId: 1,
      promise: Promise.resolve({ statusCode: 200, bytesWritten: 500_000_000 }),
    } as any);

    await downloadMmProjBackground({
      file: makeVisionFile(),
      mmProjLocalPath: `${MODELS_DIR}/mmproj.gguf`,
      modelId: 'test/model',
      combinedTotalBytes: 4_500_000_000,
      onProgress: undefined,
    });

    const opts = mockedRNFS.downloadFile.mock.calls[0][0] as any;
    expect(opts.background).toBe(true);
    expect(opts.discretionary).toBe(true);
    expect(opts.cacheable).toBe(false);
  });

  it('downloads from the correct URL', async () => {
    mockedRNFS.downloadFile.mockReturnValue({
      jobId: 1,
      promise: Promise.resolve({ statusCode: 200, bytesWritten: 500_000_000 }),
    } as any);

    await downloadMmProjBackground({
      file: makeVisionFile(),
      mmProjLocalPath: `${MODELS_DIR}/mmproj.gguf`,
      modelId: 'test/model',
      combinedTotalBytes: 4_500_000_000,
      onProgress: undefined,
    });

    const opts = mockedRNFS.downloadFile.mock.calls[0][0] as any;
    expect(opts.fromUrl).toBe('https://example.com/mmproj.gguf');
    expect(opts.toFile).toBe(`${MODELS_DIR}/mmproj.gguf`);
  });
});

// ============================================================================
// getOrphanedTextFiles
// ============================================================================

describe('getOrphanedTextFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when models directory does not exist', async () => {
    mockedRNFS.exists.mockResolvedValue(false);

    const result = await getOrphanedTextFiles(MODELS_DIR, () => Promise.resolve([]));

    expect(result).toEqual([]);
    expect(RNFS.readDir).not.toHaveBeenCalled();
  });

  it('returns empty array when directory is empty', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([]);

    const result = await getOrphanedTextFiles(MODELS_DIR, () => Promise.resolve([]));

    expect(result).toEqual([]);
  });

  it('flags files not tracked by any model', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([
      makeRNFSFile('orphan.gguf', `${MODELS_DIR}/orphan.gguf`, 2000),
    ]);

    const result = await getOrphanedTextFiles(MODELS_DIR, () => Promise.resolve([]));

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('orphan.gguf');
    expect(result[0].path).toBe(`${MODELS_DIR}/orphan.gguf`);
    expect(result[0].size).toBe(2000);
  });

  it('does not flag files tracked as model filePath', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([
      makeRNFSFile('model.gguf', `${MODELS_DIR}/model.gguf`),
    ]);
    const modelsGetter = () => Promise.resolve([
      makeDownloadedModel({ filePath: `${MODELS_DIR}/model.gguf` }),
    ]);

    const result = await getOrphanedTextFiles(MODELS_DIR, modelsGetter);

    expect(result).toHaveLength(0);
  });

  it('does not flag files tracked as model mmProjPath', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([
      makeRNFSFile('mmproj.gguf', `${MODELS_DIR}/mmproj.gguf`),
    ]);
    const modelsGetter = () => Promise.resolve([
      makeDownloadedModel({
        filePath: `${MODELS_DIR}/model.gguf`,
        mmProjPath: `${MODELS_DIR}/mmproj.gguf`,
      }),
    ]);

    const result = await getOrphanedTextFiles(MODELS_DIR, modelsGetter);

    expect(result).toHaveLength(0);
  });

  it('correctly identifies mix of tracked and untracked files', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([
      makeRNFSFile('model.gguf', `${MODELS_DIR}/model.gguf`, 4000),
      makeRNFSFile('mmproj.gguf', `${MODELS_DIR}/mmproj.gguf`, 500),
      makeRNFSFile('stray.gguf', `${MODELS_DIR}/stray.gguf`, 1000),
    ]);
    const modelsGetter = () => Promise.resolve([
      makeDownloadedModel({
        filePath: `${MODELS_DIR}/model.gguf`,
        mmProjPath: `${MODELS_DIR}/mmproj.gguf`,
      }),
    ]);

    const result = await getOrphanedTextFiles(MODELS_DIR, modelsGetter);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('stray.gguf');
  });

  it('parses string file sizes', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([
      makeRNFSFile('orphan.gguf', `${MODELS_DIR}/orphan.gguf`, '8192'),
    ]);

    const result = await getOrphanedTextFiles(MODELS_DIR, () => Promise.resolve([]));

    expect(result[0].size).toBe(8192);
  });
});

// ============================================================================
// getOrphanedImageDirs
// ============================================================================

describe('getOrphanedImageDirs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when image models directory does not exist', async () => {
    mockedRNFS.exists.mockResolvedValue(false);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, () => Promise.resolve([]));

    expect(result).toEqual([]);
    expect(RNFS.readDir).not.toHaveBeenCalled();
  });

  it('returns empty array when directory is empty', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([]);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, () => Promise.resolve([]));

    expect(result).toEqual([]);
  });

  it('flags directories not tracked by any model', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir
      .mockResolvedValueOnce([
        makeRNFSDir('unknown-model', `${IMAGE_MODELS_DIR}/unknown-model`),
      ])
      .mockResolvedValueOnce([
        makeRNFSFile('model.onnx', `${IMAGE_MODELS_DIR}/unknown-model/model.onnx`, 2000),
      ]);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, () => Promise.resolve([]));

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('unknown-model');
    expect(result[0].size).toBe(2000);
  });

  it('does not flag directory whose path matches modelPath exactly', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([
      makeRNFSDir('sd-model', `${IMAGE_MODELS_DIR}/sd-model`),
    ]);
    const imageModelsGetter = () => Promise.resolve([
      makeImageModel({ modelPath: `${IMAGE_MODELS_DIR}/sd-model` }),
    ]);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, imageModelsGetter);

    expect(result).toHaveLength(0);
  });

  it('does not flag CoreML parent directory when modelPath is nested inside it', async () => {
    // CoreML models store compiled subdir as modelPath:
    //   modelPath = /image_models/coreml-model/model_compiled.mlmodelc
    // The parent dir /image_models/coreml-model also contains tokenizer files
    // and must NOT be reported as an orphan.
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir.mockResolvedValue([
      makeRNFSDir('coreml-model', `${IMAGE_MODELS_DIR}/coreml-model`),
    ]);
    const imageModelsGetter = () => Promise.resolve([
      makeImageModel({
        id: 'coreml-model',
        modelPath: `${IMAGE_MODELS_DIR}/coreml-model/model_compiled.mlmodelc`,
      }),
    ]);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, imageModelsGetter);

    expect(result).toHaveLength(0);
  });

  it('flags directory when no model has a path inside it', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir
      .mockResolvedValueOnce([
        makeRNFSDir('orphan-dir', `${IMAGE_MODELS_DIR}/orphan-dir`),
      ])
      .mockResolvedValueOnce([]);

    const imageModelsGetter = () => Promise.resolve([
      // Tracked model is in a completely different directory
      makeImageModel({ modelPath: `${IMAGE_MODELS_DIR}/other-model` }),
    ]);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, imageModelsGetter);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('orphan-dir');
  });

  it('handles readDir failure on orphaned subdirectory gracefully (size=0)', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir
      .mockResolvedValueOnce([
        makeRNFSDir('broken-dir', `${IMAGE_MODELS_DIR}/broken-dir`),
      ])
      .mockRejectedValueOnce(new Error('Permission denied'));

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, () => Promise.resolve([]));

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('broken-dir');
    expect(result[0].size).toBe(0);
  });

  it('sums all file sizes in an orphaned directory', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir
      .mockResolvedValueOnce([
        makeRNFSDir('orphan-model', `${IMAGE_MODELS_DIR}/orphan-model`),
      ])
      .mockResolvedValueOnce([
        makeRNFSFile('unet.onnx', `${IMAGE_MODELS_DIR}/orphan-model/unet.onnx`, 1_000_000),
        makeRNFSFile('vae.onnx', `${IMAGE_MODELS_DIR}/orphan-model/vae.onnx`, 500_000),
        makeRNFSDir('subdir', `${IMAGE_MODELS_DIR}/orphan-model/subdir`),
      ]);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, () => Promise.resolve([]));

    // Only files are summed, not subdirectories
    expect(result[0].size).toBe(1_500_000);
  });

  it('parses string file sizes inside orphaned directories', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir
      .mockResolvedValueOnce([
        makeRNFSDir('orphan-model', `${IMAGE_MODELS_DIR}/orphan-model`),
      ])
      .mockResolvedValueOnce([
        makeRNFSFile('model.onnx', `${IMAGE_MODELS_DIR}/orphan-model/model.onnx`, '2048000'),
      ]);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, () => Promise.resolve([]));

    expect(result[0].size).toBe(2_048_000);
  });

  it('correctly separates tracked and orphaned directories', async () => {
    mockedRNFS.exists.mockResolvedValue(true);
    mockedRNFS.readDir
      .mockResolvedValueOnce([
        makeRNFSDir('tracked-model', `${IMAGE_MODELS_DIR}/tracked-model`),
        makeRNFSDir('orphan-model', `${IMAGE_MODELS_DIR}/orphan-model`),
      ])
      .mockResolvedValueOnce([
        makeRNFSFile('f.onnx', `${IMAGE_MODELS_DIR}/orphan-model/f.onnx`, 100),
      ]);

    const imageModelsGetter = () => Promise.resolve([
      makeImageModel({ modelPath: `${IMAGE_MODELS_DIR}/tracked-model` }),
    ]);

    const result = await getOrphanedImageDirs(IMAGE_MODELS_DIR, imageModelsGetter);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('orphan-model');
  });
});
