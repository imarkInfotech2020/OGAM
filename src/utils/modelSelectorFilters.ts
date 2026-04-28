import { DownloadedModel, ONNXImageModel } from '../types';

function isUnknownLike(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === 'unknown';
}

export function isSuspiciousRecoveredTextModel(model: DownloadedModel): boolean {
  if (!model.id.startsWith('recovered_')) return false;
  return isUnknownLike(model.author) || isUnknownLike(model.quantization);
}

export function isSuspiciousRecoveredImageModel(model: ONNXImageModel): boolean {
  return model.id.startsWith('recovered_');
}
