/**
 * Boot-time model preloader.
 *
 * Warms the user's selected models in priority order — text → image → TTS → STT
 * — so the common paths are hot with no cold-start wait. Each model loads only
 * if it fits the residency budget WITHOUT evicting a higher-priority model
 * already warmed, so it self-limits on smaller devices (text always wins; the
 * rest fill the remaining budget). Loads run sequentially (one native load at a
 * time) so the UI stays responsive.
 */
import { useAppStore, useWhisperStore } from '../stores';
import { activeModelService } from './activeModelService';
import { hardwareService } from './hardware';
import { WHISPER_MODELS } from './whisperService';
import { modelResidencyManager } from './modelResidency';
import { callHook, HOOKS } from '../bootstrap/hookRegistry';
import logger from '../utils/logger';

let started = false;

const toMB = (bytes: number) => Math.round(bytes / (1024 * 1024));

async function preloadText(): Promise<void> {
  const { activeModelId, lastTextModelId, downloadedModels } = useAppStore.getState();
  const id = activeModelId ?? lastTextModelId;
  if (!id || activeModelService.getActiveModels().text.isLoaded) return;
  const model = downloadedModels.find(m => m.id === id);
  if (!model) return;
  const sizeMB = toMB(hardwareService.estimateModelRam(model));
  if (!modelResidencyManager.canLoadWithoutEviction({ key: 'text', sizeMB })) return;
  await activeModelService.loadTextModel(id);
}

async function preloadImage(): Promise<void> {
  const { activeImageModelId, downloadedImageModels } = useAppStore.getState();
  if (!activeImageModelId || activeModelService.getActiveModels().image.isLoaded) return;
  const model = downloadedImageModels.find(m => m.id === activeImageModelId);
  if (!model) return;
  const sizeMB = toMB(hardwareService.estimateModelRam(model));
  if (!modelResidencyManager.canLoadWithoutEviction({ key: 'image', sizeMB })) return;
  await activeModelService.loadImageModel(activeImageModelId);
}

async function preloadTts(): Promise<void> {
  // Pro implements the audio.preload hook (fits-gated + registers the engine);
  // no-op in free builds.
  const pending = callHook<Promise<void>>(HOOKS.audioPreload);
  if (pending) await pending;
}

async function preloadStt(): Promise<void> {
  const whisper = useWhisperStore.getState();
  if (!whisper.downloadedModelId || whisper.isModelLoaded) return;
  const sizeMB = WHISPER_MODELS.find(m => m.id === whisper.downloadedModelId)?.size ?? 200;
  if (!modelResidencyManager.canLoadWithoutEviction({ key: 'whisper', sizeMB })) return;
  await whisper.loadModel();
}

/** Warm selected models in priority order. Safe to call once at app launch. */
export async function preloadSelectedModels(): Promise<void> {
  if (started) return;
  started = true;
  const steps: Array<[string, () => Promise<void>]> = [
    ['text', preloadText],
    ['image', preloadImage],
    ['tts', preloadTts],
    ['stt', preloadStt],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      logger.log(`[Preload] ${name} failed:`, err);
    }
  }
}

/** Test helper. */
export function _resetPreloaderForTesting(): void {
  started = false;
}
