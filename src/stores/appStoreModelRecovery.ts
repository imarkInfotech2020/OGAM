// Which recovered models this app is willing to trust.
//
// Recovery reads whatever files survive on disk, and a file can outlive the metadata that described
// it - leaving a row whose name, size or family reads as "unknown". These predicates are the one
// place that decides what to do with such a row. Pure, so they can be reasoned about without a store.
import { DownloadedModel, ONNXImageModel } from '../types';

export function isUnknownLike(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === 'unknown';
}

export function isSuspiciousRecoveredTextModel(model: DownloadedModel): boolean {
  const isRecovered = model.id.startsWith('recovered_');
  if (!isRecovered) return false;

  const hasUnknownAuthor = isUnknownLike(model.author);
  const hasUnknownQuantization = isUnknownLike(model.quantization);

  return hasUnknownAuthor || hasUnknownQuantization;
}

export function isSuspiciousRecoveredImageModel(model: ONNXImageModel): boolean {
  return model.id.startsWith('recovered_');
}

// Whisper STT models are managed by whisperService (modelId 'whisper-<id>',
// file 'ggml-<id>.bin') and belong to the Voice/Speech surfaces. They were being
// recovered into the text model store, so they appeared under Text in the model
// selector and as text-icon entries in the Download Manager. Exclude them here so
// the single downloadedModels source never carries them — which also clears the
// phantom entries already persisted on devices on the next setDownloadedModels.
export function isWhisperTextModel(model: DownloadedModel): boolean {
  return (
    model.id.startsWith('whisper-') ||
    (model.fileName?.startsWith('ggml-') === true &&
      model.fileName.endsWith('.bin'))
  );
}

export function isExcludedTextModel(model: DownloadedModel): boolean {
  return isSuspiciousRecoveredTextModel(model) || isWhisperTextModel(model);
}
