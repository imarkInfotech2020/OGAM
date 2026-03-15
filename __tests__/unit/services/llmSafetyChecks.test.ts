import RNFS from 'react-native-fs';
import { validateModelFile, checkMemoryForModel } from '../../../src/services/llmSafetyChecks';

const mockedRNFS = RNFS as jest.Mocked<typeof RNFS>;

describe('validateModelFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns invalid when file is too small', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 100 } as any);

    const result = await validateModelFile('/models/tiny.gguf');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('too small');
  });

  it('returns valid for a proper GGUF file', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 1_000_000 } as any);
    mockedRNFS.read.mockResolvedValue('GGUF');

    const result = await validateModelFile('/models/test.gguf');
    expect(result).toEqual({ valid: true });
  });

  it('returns invalid when header is not GGUF', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 1_000_000 } as any);
    mockedRNFS.read.mockResolvedValue('NOPE');

    const result = await validateModelFile('/models/test.bin');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not a GGUF file');
  });

  it('returns valid when RNFS.read() throws (iOS bridging workaround)', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 1_000_000 } as any);
    mockedRNFS.read.mockRejectedValueOnce(new Error('NSInteger bridge error'));

    const result = await validateModelFile('/models/test.gguf');
    expect(result).toEqual({ valid: true });
  });

  it('returns invalid when stat throws', async () => {
    mockedRNFS.stat.mockRejectedValue(new Error('file not found'));

    const result = await validateModelFile('/models/missing.gguf');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Failed to validate');
  });

  it('handles string file size from stat', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: '5000000' } as any);
    mockedRNFS.read.mockResolvedValue('GGUF');

    const result = await validateModelFile('/models/test.gguf');
    expect(result).toEqual({ valid: true });
  });
});

describe('checkMemoryForModel', () => {
  const mockGetMemory = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns safe when enough memory is available', async () => {
    mockGetMemory.mockResolvedValue({
      available: 4 * 1024 * 1024 * 1024, // 4 GB
      total: 8 * 1024 * 1024 * 1024,
    });

    const result = await checkMemoryForModel(
      500 * 1024 * 1024, // 500 MB model
      2048,
      mockGetMemory,
    );
    expect(result.safe).toBe(true);
  });

  it('returns unsafe when not enough memory', async () => {
    mockGetMemory.mockResolvedValue({
      available: 300 * 1024 * 1024, // 300 MB
      total: 4 * 1024 * 1024 * 1024,
    });

    const result = await checkMemoryForModel(
      2 * 1024 * 1024 * 1024, // 2 GB model
      4096,
      mockGetMemory,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Not enough memory');
  });

  it('returns safe when memory check throws', async () => {
    mockGetMemory.mockRejectedValue(new Error('not supported'));

    const result = await checkMemoryForModel(500 * 1024 * 1024, 2048, mockGetMemory);
    expect(result.safe).toBe(true);
  });
});
