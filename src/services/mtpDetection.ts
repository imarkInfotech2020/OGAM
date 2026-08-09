import { loadLlamaModelInfo } from 'llama.rn';
import logger from '../utils/logger';
import { modelDeclaresMtp } from '../utils/mtpSupport';

/**
 * The I/O half of "can this model draft its own tokens": read the GGUF's self-declared metadata and
 * hand it to the pure rule. Separate from the rule so the rule is testable without a filesystem.
 *
 * `loadLlamaModelInfo` reads the header only — it does not load the model — so this is cheap enough
 * to run when a model becomes active, which is what lets the chat suggest MTP without the user
 * hunting through settings.
 *
 * Cached per path: a file's metadata cannot change under us, and an unreadable file is cached as a
 * NO so a broken path is not re-read on every render.
 */
const cache = new Map<string, boolean>();

export async function modelSupportsMtp(modelPath: string | undefined): Promise<boolean> {
  if (!modelPath) return false;
  const cached = cache.get(modelPath);
  if (cached !== undefined) return cached;
  let supports = false;
  try {
    const info = await loadLlamaModelInfo(modelPath);
    supports = modelDeclaresMtp(info as Record<string, unknown>);
    logger.log(`[MTP-SM] ${modelPath.split('/').pop()} declares MTP=${supports}`);
  } catch (error) {
    logger.warn('[MTP-SM] could not read model metadata:', error);
  }
  cache.set(modelPath, supports);
  return supports;
}
