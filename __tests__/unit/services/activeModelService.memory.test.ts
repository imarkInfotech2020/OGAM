/**
 * Unit tests for activeModelService/memory.ts
 * Focuses on LiteRT-only branches (liteRTService loaded, llmService not loaded).
 */

import { getCurrentlyLoadedMemoryGB, getOtherLoadedMemoryGB } from '../../../src/services/activeModelService/memory';

jest.mock('../../../src/services/llm', () => ({
  llmService: { isModelLoaded: jest.fn() },
}));

jest.mock('../../../src/services/litert', () => ({
  liteRTService: { isModelLoaded: jest.fn() },
}));

jest.mock('../../../src/services/hardware', () => ({
  hardwareService: {
    getDeviceInfo: jest.fn(() => Promise.resolve({ totalMemory: 8 * 1024 * 1024 * 1024 })),
  },
}));

import { llmService } from '../../../src/services/llm';
import { liteRTService } from '../../../src/services/litert';

const mockedLlm = llmService as jest.Mocked<typeof llmService>;
const mockedLiteRT = liteRTService as jest.Mocked<typeof liteRTService>;

const TEXT_MODEL = { id: 'model-1', name: 'Test Model', fileSize: 4 * 1024 * 1024 * 1024 } as any;
const IMAGE_MODEL = { id: 'img-1', name: 'Image Model', size: 2 * 1024 * 1024 * 1024 } as any;

const LISTS = {
  downloadedModels: [TEXT_MODEL],
  downloadedImageModels: [IMAGE_MODEL],
};

describe('getCurrentlyLoadedMemoryGB', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts text model memory when only liteRTService is loaded', () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(true);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const result = getCurrentlyLoadedMemoryGB(
      { loadedTextModelId: 'model-1', loadedImageModelId: null },
      LISTS,
    );

    // 4 GB * TEXT_MODEL_OVERHEAD_MULTIPLIER (1.5)
    expect(result).toBeCloseTo(6, 1);
  });

  it('returns 0 for text model when both services report not loaded', () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(false);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const result = getCurrentlyLoadedMemoryGB(
      { loadedTextModelId: 'model-1', loadedImageModelId: null },
      LISTS,
    );

    expect(result).toBe(0);
  });

  it('counts text model memory when only llmService is loaded', () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(false);
    mockedLlm.isModelLoaded.mockReturnValue(true);

    const result = getCurrentlyLoadedMemoryGB(
      { loadedTextModelId: 'model-1', loadedImageModelId: null },
      LISTS,
    );

    expect(result).toBeGreaterThan(0);
  });

  it('includes image model memory regardless of text model loaded state', () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(false);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const result = getCurrentlyLoadedMemoryGB(
      { loadedTextModelId: null, loadedImageModelId: 'img-1' },
      LISTS,
    );

    // 2 GB * IMAGE_MODEL_OVERHEAD_MULTIPLIER (1.5 on iOS, 1.8 on Android)
    expect(result).toBeGreaterThan(2.9);
  });

  it('sums both models when liteRT loaded and image model also loaded', () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(true);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const result = getCurrentlyLoadedMemoryGB(
      { loadedTextModelId: 'model-1', loadedImageModelId: 'img-1' },
      LISTS,
    );

    // text(6) + image(3 or 3.6) - just verify it's greater than text alone
    expect(result).toBeGreaterThan(6);
  });
});

describe('getOtherLoadedMemoryGB', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts text model memory (LiteRT only loaded) when loading an image model', () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(true);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const result = getOtherLoadedMemoryGB(
      'image',
      { loadedTextModelId: 'model-1', loadedImageModelId: null },
      LISTS,
    );

    // 4 GB * TEXT_MODEL_OVERHEAD_MULTIPLIER (1.5)
    expect(result).toBeCloseTo(6, 1);
  });

  it('returns 0 for image model loading when neither service is loaded', () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(false);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const result = getOtherLoadedMemoryGB(
      'image',
      { loadedTextModelId: 'model-1', loadedImageModelId: null },
      LISTS,
    );

    expect(result).toBe(0);
  });

  it('counts image model memory when loading a text model (no service check needed)', () => {
    mockedLiteRT.isModelLoaded.mockReturnValue(false);
    mockedLlm.isModelLoaded.mockReturnValue(false);

    const result = getOtherLoadedMemoryGB(
      'text',
      { loadedTextModelId: null, loadedImageModelId: 'img-1' },
      LISTS,
    );

    // 2 GB * IMAGE_MODEL_OVERHEAD_MULTIPLIER
    expect(result).toBeGreaterThan(2.9);
  });
});
