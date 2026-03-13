
/**
 * Remote Model Capabilities
 *
 * Helpers for fetching model metadata (context length, vision support)
 * from Ollama and LM Studio servers.
 */

export interface OllamaModelInfo {
  contextLength: number;
  supportsVision: boolean;
}

function extractOllamaCapabilities(data: unknown): OllamaModelInfo {
  let contextLength = 4096;
  let supportsVision = false;

  const typed = data as Record<string, unknown>;

  if (typed?.model_info && typeof typed.model_info === 'object') {
    for (const key of Object.keys(typed.model_info as object)) {
      if (key.endsWith('.context_length')) {
        const val = (typed.model_info as Record<string, unknown>)[key];
        if (typeof val === 'number' && val > 0) contextLength = val;
      }
      // Ollama sets keys like "clip.vision.block_count" or "llava.image_token_index"
      // for multimodal models — presence of any vision/clip key means vision support
      if (key.includes('vision') || key.includes('clip')) {
        supportsVision = true;
      }
    }
  }

  // Fallback context length from parameters string
  if (contextLength === 4096 && typeof typed?.parameters === 'string') {
    const match = /num_ctx\s+(\d+)/.exec(typed.parameters);
    if (match) {
      const val = Number.parseInt(match[1], 10);
      if (val > 0) contextLength = val;
    }
  }

  return { contextLength, supportsVision };
}

/**
 * Fetches model capabilities for an Ollama model via POST /api/show.
 * Vision is detected by inspecting model_info keys for "vision" or "clip" —
 * Ollama populates these for multimodal models (e.g. clip.vision.block_count).
 * Falls back to contextLength=4096, supportsVision=false on any failure.
 */
export async function fetchOllamaModelInfo(
  endpoint: string,
  modelName: string,
): Promise<OllamaModelInfo> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${endpoint}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return { contextLength: 4096, supportsVision: false };

    const data = await response.json();
    return extractOllamaCapabilities(data);
  } catch {
    // Timeout, network error, parse error
  }

  return { contextLength: 4096, supportsVision: false };
}

/**
 * Fetches model capabilities for an LM Studio server via GET /api/v1/models.
 * LM Studio's native endpoint exposes vision and tool-use capability per model.
 * Falls back to contextLength=4096, supportsVision=false on any failure.
 */
export async function fetchLmStudioModelInfo(
  endpoint: string,
  modelId: string,
): Promise<OllamaModelInfo> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${endpoint}/api/v1/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return { contextLength: 4096, supportsVision: false };

    const data = await response.json();
    // LM Studio /api/v1/models returns { models: [...] } with each entry keyed by "key" field
    const models: unknown[] = Array.isArray(data?.models) ? data.models : [];

    const model = models.find(
      (m): m is Record<string, unknown> =>
        typeof m === 'object' && m !== null && (m as Record<string, unknown>).key === modelId,
    );

    if (!model) return { contextLength: 4096, supportsVision: false };

    // LM Studio capabilities: { vision: bool, trained_for_tool_use: bool }
    // Note: type is always "llm" even for VL models — use capabilities.vision instead
    const supportsVision =
      typeof model.capabilities === 'object' &&
      model.capabilities !== null &&
      (model.capabilities as Record<string, unknown>).vision === true;

    const contextLength =
      typeof model.max_context_length === 'number' && model.max_context_length > 0
        ? model.max_context_length
        : 4096;

    return { contextLength, supportsVision: Boolean(supportsVision) };
  } catch {
    // Timeout, network error, parse error
  }

  return { contextLength: 4096, supportsVision: false };
}

/** Returns true for models that generate text/images — filters out embedding, reranker, etc. */
export function isGenerativeModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  const nonGenerativePatterns = [
    'embed', 'embedding', 'rerank', 'reranker', 'classifier',
    'bge-', 'e5-', 'gte-', 'minilm', 'arctic-embed',
  ];
  return !nonGenerativePatterns.some(p => id.includes(p));
}
