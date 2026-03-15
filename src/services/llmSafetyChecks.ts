import { LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import logger from '../utils/logger';

/**
 * GGUF magic number — first 4 bytes of every valid GGUF file.
 * Used to detect corrupted or truncated model files before loading.
 */
const GGUF_MAGIC = 'GGUF';

/** Minimum plausible GGUF file size (header + at least some tensors) */
const MIN_GGUF_FILE_SIZE = 1024; // 1 KB

/**
 * Validate that a model file is a plausible GGUF file.
 * Checks magic bytes and minimum file size to catch corrupted/truncated downloads.
 */
export async function validateModelFile(modelPath: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const stat = await RNFS.stat(modelPath);
    const fileSize = typeof stat.size === 'string' ? Number.parseInt(stat.size, 10) : stat.size;
    if (fileSize < MIN_GGUF_FILE_SIZE) {
      return { valid: false, reason: `Model file too small (${fileSize} bytes) — likely corrupted or incomplete download` };
    }
    // Read first 4 bytes to check GGUF magic number.
    // RNFS.read() has an iOS bridging bug with NSInteger arguments on
    // react-native-fs 2.x, so we catch and skip the magic check if it fails.
    // llama.rn will still validate the file format natively on load.
    let header: string | undefined;
    try {
      header = await RNFS.read(modelPath, 4, 0, 'ascii');
    } catch (readErr) {
      logger.warn('[LLM] RNFS.read() failed for magic check, skipping header validation:', readErr);
    }
    if (header !== undefined && !header.startsWith(GGUF_MAGIC)) {
      return { valid: false, reason: `Invalid model file — not a GGUF file (header: ${header.substring(0, 8)})` };
    }
    return { valid: true };
  } catch (e: any) {
    return { valid: false, reason: `Failed to validate model file: ${e?.message || e}` };
  }
}

/**
 * Check whether the device has enough available memory to safely load a model.
 * Returns the estimated RAM needed and whether it's safe to proceed.
 *
 * Uses a 1.2x multiplier on file size as a conservative estimate of runtime RAM.
 * Context window KV cache adds additional memory proportional to context length.
 */
export async function checkMemoryForModel(
  modelFileSize: number,
  contextLength: number,
  getAvailableMemory: () => Promise<{ available: number; total: number }>,
): Promise<{ safe: boolean; reason?: string; estimatedMB: number; availableMB: number }> {
  try {
    const { available, total } = await getAvailableMemory();
    const availableMB = available / (1024 * 1024);
    const totalMB = total / (1024 * 1024);
    // Model weights in RAM (~1x file size for mmap, up to 1.2x without)
    const modelMB = (modelFileSize * 1.2) / (1024 * 1024);
    // KV cache estimate: ~0.5 MB per 1024 context tokens (quantized cache)
    const kvCacheMB = (contextLength / 1024) * 0.5;
    const estimatedMB = modelMB + kvCacheMB;
    // Require at least 200MB headroom after model load for OS and app
    const MIN_HEADROOM_MB = 200;
    const safe = availableMB > estimatedMB + MIN_HEADROOM_MB;
    if (!safe) {
      return {
        safe: false,
        reason: `Not enough memory: model needs ~${Math.round(estimatedMB)}MB but only ${Math.round(availableMB)}MB available (device total: ${Math.round(totalMB)}MB). Try closing other apps or using a smaller model.`,
        estimatedMB,
        availableMB,
      };
    }
    return { safe: true, estimatedMB, availableMB };
  } catch (e: any) {
    // If we can't check memory, proceed anyway but log a warning
    logger.warn('[LLM] Could not check available memory:', e?.message || e);
    return { safe: true, estimatedMB: 0, availableMB: 0 };
  }
}

/**
 * Wraps a llama.rn completion call with error handling for native crashes.
 * Catches ggml_abort and OOM-style errors and returns a structured error
 * instead of letting the app crash unrecoverably.
 */
export async function safeCompletion<T>(
  context: LlamaContext,
  completionFn: () => Promise<T>,
  label: string = 'completion',
): Promise<T> {
  try {
    return await completionFn();
  } catch (error: any) {
    const msg = error?.message || String(error) || '';
    const isNativeCrash = msg.includes('ggml') || msg.includes('abort') ||
      msg.includes('SIGABRT') || msg.includes('tensor') ||
      msg.includes('alloc') || msg.includes('out of memory') ||
      msg.includes('failed to allocate') || msg.includes('OOM');
    if (isNativeCrash) {
      logger.error(`[LLM] Native crash during ${label}: ${msg}`);
      // Try to recover the context by clearing KV cache
      try {
        await (context as any).clearCache(true);
        logger.log(`[LLM] KV cache cleared after native error in ${label}`);
      } catch (clearError) {
        logger.warn(`[LLM] Failed to clear KV cache after crash: ${clearError}`);
      }
      throw new Error(`Model inference failed (native error). The model's KV cache has been cleared. Please try again, or use a smaller model/context size. (${msg})`);
    }
    throw error;
  }
}
