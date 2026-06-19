/**
 * Auto-provisions a small default intent-classifier model (SmolLM2-135M) so
 * LLM-based routing works out of the box without the user manually picking a
 * classifier. Downloads in the background via the normal text-model path (so it
 * shows in the Download Manager) and sets it as settings.classifierModelId on
 * completion. No-op once a usable classifier is configured.
 *
 * See docs/design/MODEL_ROUTING.md §5.3.
 */
import { useAppStore } from '../stores';
import { modelManager } from './modelManager';
import { huggingFaceService } from './huggingface';
import logger from '../utils/logger';

/** SmolLM2-135M-Instruct GGUF — ~100-145MB, runs on llama.rn. */
const CLASSIFIER_REPO = 'bartowski/SmolLM2-135M-Instruct-GGUF';

let provisioning = false;

function hasUsableClassifier(): boolean {
  const { settings, downloadedModels } = useAppStore.getState();
  return !!settings.classifierModelId && downloadedModels.some(m => m.id === settings.classifierModelId);
}

/**
 * Ensure a default classifier model is downloaded and selected. Safe to call
 * repeatedly (guards against duplicate downloads). Resolves immediately; the
 * download proceeds in the background.
 */
export async function ensureDefaultClassifier(): Promise<void> {
  if (hasUsableClassifier() || provisioning) return;

  const store = useAppStore.getState();
  // Already downloaded the default (e.g. selection was cleared)? Just select it.
  const existing = store.downloadedModels.find(m => m.id.startsWith(`${CLASSIFIER_REPO}/`));
  if (existing) {
    store.updateSettings({ classifierModelId: existing.id });
    return;
  }

  if (!modelManager.isBackgroundDownloadSupported?.()) return;

  provisioning = true;
  try {
    const files = await huggingFaceService.getModelFiles(CLASSIFIER_REPO);
    const ggufs = files
      .filter(f => f.name.toLowerCase().endsWith('.gguf'))
      .sort((a, b) => (a.size || 0) - (b.size || 0));
    // Prefer Q8_0 (best quality at this tiny size), else the smallest GGUF.
    const file = ggufs.find(f => /q8_0/i.test(f.name)) ?? ggufs[0];
    if (!file) {
      logger.log('[Classifier] no GGUF found in', CLASSIFIER_REPO);
      provisioning = false;
      return;
    }
    logger.log('[Classifier] auto-provisioning', file.name);
    const info = await modelManager.downloadModelBackground(CLASSIFIER_REPO, file);
    modelManager.watchDownload(
      info.downloadId,
      () => {
        useAppStore.getState().updateSettings({ classifierModelId: `${CLASSIFIER_REPO}/${file.name}` });
        provisioning = false;
        logger.log('[Classifier] ready:', file.name);
      },
      (err) => {
        provisioning = false;
        logger.log('[Classifier] download failed:', err);
      },
    );
  } catch (err) {
    provisioning = false;
    logger.log('[Classifier] auto-provision error:', err);
  }
}
