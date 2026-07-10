import { useAppStore } from '../stores';
import { llmService } from './llm';
import { liteRTService } from './litert';
import logger from '../utils/logger';

/** Every text-generation engine, defined ONCE here so callers never hardcode the concrete set. */
const TEXT_ENGINES = [liteRTService, llmService];

/**
 * Unload every text engine (an idle engine is a safe no-op). Used on a model switch so a
 * cross-engine swap (LiteRT <-> llama) can't leave the previous model resident, without the
 * caller branching on which concrete engine held it. Adding an engine is one entry above (OCP).
 */
export async function unloadAllTextEngines(): Promise<void> {
  for (const engine of TEXT_ENGINES) {
    try {
      await engine.unloadModel();
    } catch (e) {
      logger.warn('[engines] text engine unload during switch failed, continuing:', e);
    }
  }
}

/**
 * Returns the service for the currently active text engine, or null if no
 * model is loaded. Use this for operations that both engines support
 * (stopGeneration, isModelLoaded, unloadModel). For engine-specific
 * operations keep the explicit branch — it should be visible at the call site.
 */
export function getActiveEngineService(): typeof llmService | typeof liteRTService | null {
  const { downloadedModels, activeModelId } = useAppStore.getState();
  const model = downloadedModels.find(m => m.id === activeModelId);
  if (!model) return null;
  return model.engine === 'litert' ? liteRTService : llmService;
}
