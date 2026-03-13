
/**
 * Remote Model Capabilities
 *
 * Helpers for fetching model metadata (context length, vision support)
 * from Ollama and LM Studio servers.
 */

export interface RemoteModelInfo {
  contextLength: number;
  supportsVision: boolean;
  supportsToolCalling?: boolean;
  supportsThinking?: boolean;
}

function parseModelInfoKeys(modelInfo: Record<string, unknown>): { contextLength: number; supportsVision: boolean } {
  let contextLength = 0;
  let supportsVision = false;
  for (const key of Object.keys(modelInfo)) {
    if (key.endsWith('.context_length')) {
      const val = modelInfo[key];
      if (typeof val === 'number' && val > 0) contextLength = val;
    }
    if (key.includes('vision') || key.includes('clip')) {
      supportsVision = true;
    }
  }
  return { contextLength, supportsVision };
}

function parseNumCtx(parameters: string): number {
  const match = /num_ctx\s+(\d+)/.exec(parameters);
  if (match) {
    const val = Number.parseInt(match[1], 10);
    if (val > 0) return val;
  }
  return 0;
}

function extractOllamaCapabilities(data: Record<string, unknown>): RemoteModelInfo {
  let contextLength = 4096;
  let supportsVision = false;

  if (data.model_info && typeof data.model_info === 'object') {
    const parsed = parseModelInfoKeys(data.model_info as Record<string, unknown>);
    if (parsed.contextLength > 0) contextLength = parsed.contextLength;
    supportsVision = parsed.supportsVision;
  }

  if (contextLength === 4096 && typeof data.parameters === 'string') {
    const numCtx = parseNumCtx(data.parameters);
    if (numCtx > 0) contextLength = numCtx;
  }

  // Thinking support detection:
  // - Older models: template contains .Think / .Thinking / .IsThinkSet
  // - Newer models (qwen3.5+): use RENDERER/PARSER in modelfile instead of template logic
  const template = typeof data.template === 'string' ? data.template : '';
  const modelfile = typeof data.modelfile === 'string' ? data.modelfile : '';
  const supportsThinking =
    /\.Think|\.Thinking|\.IsThinkSet/.test(template) ||
    /^RENDERER\s/m.test(modelfile);

  return { contextLength, supportsVision, supportsThinking };
}

/**
 * Fetches model capabilities for an Ollama model via POST /api/show.
 * Vision is detected by inspecting model_info keys for "vision" or "clip" —
 * Ollama populates these for multimodal models (e.g. clip.vision.block_count).
 * Falls back to contextLength=4096, supportsVision=false on any failure.
 */
export async function fetchRemoteModelInfo(
  endpoint: string,
  modelName: string,
): Promise<RemoteModelInfo> {
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
): Promise<RemoteModelInfo> {
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
    const caps = typeof model.capabilities === 'object' && model.capabilities !== null
      ? model.capabilities as Record<string, unknown>
      : {};

    const contextLength =
      typeof model.max_context_length === 'number' && model.max_context_length > 0
        ? model.max_context_length
        : 4096;

    // LM Studio doesn't expose thinking capability in /api/v1/models.
    // Probe via a 1-token streaming request — thinking models emit <think> as the first chunk.
    const supportsThinking = await probeLmStudioThinking(endpoint, modelId);

    return {
      contextLength,
      supportsVision: caps.vision === true,
      supportsToolCalling: caps.trained_for_tool_use === true,
      supportsThinking,
    };
  } catch {
    // Timeout, network error, parse error
  }

  return { contextLength: 4096, supportsVision: false };
}

/**
 * Probe an LM Studio model for thinking support by sending a 1-token streaming
 * request and checking if the first content delta is `<think>`.
 */
async function probeLmStudioThinking(endpoint: string, modelId: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: true,
        chat_template_kwargs: { enable_thinking: true },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok || !response.body) return false;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Parse first SSE data line
      const match = /^data: ({.+})$/m.exec(buf);
      if (match) {
        reader.cancel();
        const chunk = JSON.parse(match[1]);
        const content = chunk?.choices?.[0]?.delta?.content ?? '';
        return content.includes('<think>');
      }
    }
  } catch {
    // Timeout, network error, model not loaded — not a thinking model or can't determine
  }
  return false;
}

function hasRealData(info: RemoteModelInfo): boolean {
  return info.supportsVision || info.contextLength !== 4096 || info.supportsToolCalling === true || info.supportsThinking === true;
}

/**
 * Fetch model capabilities by trying both Ollama and LM Studio APIs in parallel.
 * Falls back to name-based detection when neither API returns real data.
 * Works regardless of the port the server runs on.
 */
export async function fetchModelCapabilities(
  endpoint: string,
  modelId: string,
  nameBasedDetect: { vision: (id: string) => boolean; toolCalling: (id: string) => boolean },
): Promise<RemoteModelInfo> {
  const [ollamaInfo, lmInfo] = await Promise.all([
    fetchRemoteModelInfo(endpoint, modelId),
    fetchLmStudioModelInfo(endpoint, modelId),
  ]);

  if (hasRealData(ollamaInfo)) return ollamaInfo;
  if (hasRealData(lmInfo)) return lmInfo;

  // Neither API returned real data — fall back to name-based detection
  return {
    contextLength: 4096,
    supportsVision: nameBasedDetect.vision(modelId),
    supportsToolCalling: nameBasedDetect.toolCalling(modelId),
  };
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
