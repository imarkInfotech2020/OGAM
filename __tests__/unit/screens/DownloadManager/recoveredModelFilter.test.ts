import { DownloadedModel } from '../../../../src/types';

function isUnknownLike(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === 'unknown';
}

function isSuspiciousRecoveredModel(model: DownloadedModel): boolean {
  const isRecovered = model.id.startsWith('recovered_');
  if (!isRecovered) return false;

  const hasUnknownAuthor = isUnknownLike(model.author);
  const hasUnknownQuantization = isUnknownLike(model.quantization);

  return hasUnknownAuthor || hasUnknownQuantization;
}

describe('isSuspiciousRecoveredModel', () => {
  it('should filter recovered models with unknown author', () => {
    const model: DownloadedModel = {
      id: 'recovered_gemma-4_123456',
      name: 'gemma-4',
      author: 'Unknown',
      quantization: 'Q4_K_M',
      filePath: '/models/gemma-4.gguf',
      fileName: 'gemma-4.gguf',
      fileSize: 14 * 1024 * 1024,
      downloadedAt: new Date().toISOString(),
    };
    expect(isSuspiciousRecoveredModel(model)).toBe(true);
  });

  it('should filter recovered models with unknown quantization', () => {
    const model: DownloadedModel = {
      id: 'recovered_qwen_123456',
      name: 'qwen',
      author: 'unsloth',
      quantization: 'Unknown',
      filePath: '/models/qwen.gguf',
      fileName: 'qwen.gguf',
      fileSize: 220 * 1024 * 1024,
      downloadedAt: new Date().toISOString(),
    };
    expect(isSuspiciousRecoveredModel(model)).toBe(true);
  });

  it('should filter recovered models with both unknown author and quantization', () => {
    const model: DownloadedModel = {
      id: 'recovered_model_123456',
      name: 'model',
      author: 'Unknown',
      quantization: 'Unknown',
      filePath: '/models/model.gguf',
      fileName: 'model.gguf',
      fileSize: 16 * 1024 * 1024,
      downloadedAt: new Date().toISOString(),
    };
    expect(isSuspiciousRecoveredModel(model)).toBe(true);
  });

  it('should not filter recovered models with valid metadata', () => {
    const model: DownloadedModel = {
      id: 'recovered_model_123456',
      name: 'model',
      author: 'huggingface',
      quantization: 'Q4_K_M',
      filePath: '/models/model.gguf',
      fileName: 'model.gguf',
      fileSize: 5 * 1024 * 1024 * 1024,
      downloadedAt: new Date().toISOString(),
    };
    expect(isSuspiciousRecoveredModel(model)).toBe(false);
  });

  it('should not filter non-recovered models even with unknown metadata', () => {
    const model: DownloadedModel = {
      id: 'unsloth/Qwen2.5-7B-Instruct-GGUF',
      name: 'Qwen2.5-7B-Instruct',
      author: 'Unknown',
      quantization: 'Unknown',
      filePath: '/models/qwen.gguf',
      fileName: 'qwen.gguf',
      fileSize: 5 * 1024 * 1024 * 1024,
      downloadedAt: new Date().toISOString(),
    };
    expect(isSuspiciousRecoveredModel(model)).toBe(false);
  });

  it('should handle empty author/quantization as unknown', () => {
    const model: DownloadedModel = {
      id: 'recovered_model_123456',
      name: 'model',
      author: '',
      quantization: '  ',
      filePath: '/models/model.gguf',
      fileName: 'model.gguf',
      fileSize: 50 * 1024 * 1024,
      downloadedAt: new Date().toISOString(),
    };
    expect(isSuspiciousRecoveredModel(model)).toBe(true);
  });
});
