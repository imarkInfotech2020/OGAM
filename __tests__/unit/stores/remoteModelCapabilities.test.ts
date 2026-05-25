/**
 * Unit tests for remoteModelCapabilities.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  fetchRemoteModelInfo,
  fetchLmStudioModelInfo,
  fetchModelCapabilities,
  isGenerativeModel,
} from '../../../src/stores/remoteModelCapabilities';

function mockFetch(response: Partial<Response> & { ok: boolean }) {
  globalThis.fetch = jest.fn().mockResolvedValue(response);
}

function mockFetchError(err: Error) {
  globalThis.fetch = jest.fn().mockRejectedValue(err);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// isGenerativeModel
// ---------------------------------------------------------------------------

describe('isGenerativeModel', () => {
  it('returns true for a standard chat model', () => {
    expect(isGenerativeModel('llama3.2')).toBe(true);
    expect(isGenerativeModel('mistral-7b')).toBe(true);
  });

  it('returns false for embedding models', () => {
    expect(isGenerativeModel('nomic-embed-text')).toBe(false);
    expect(isGenerativeModel('text-embedding-ada-002')).toBe(false);
    expect(isGenerativeModel('bge-small-en')).toBe(false);
    expect(isGenerativeModel('e5-large')).toBe(false);
    expect(isGenerativeModel('minilm-v2')).toBe(false);
    expect(isGenerativeModel('arctic-embed-m')).toBe(false);
  });

  it('returns false for reranker models', () => {
    expect(isGenerativeModel('rerank-multilingual')).toBe(false);
    expect(isGenerativeModel('bge-reranker-base')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchRemoteModelInfo (Ollama /api/show)
// ---------------------------------------------------------------------------

describe('fetchRemoteModelInfo', () => {
  it('returns default fallback on fetch error', async () => {
    mockFetchError(new Error('network error'));
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'llama3');
    expect(result).toEqual({ contextLength: 4096, supportsVision: false });
  });

  it('returns default fallback when response is not ok', async () => {
    mockFetch({ ok: false, json: async () => ({}) } as any);
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'llama3');
    expect(result).toEqual({ contextLength: 4096, supportsVision: false });
  });

  it('extracts contextLength from model_info', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model_info: { 'llama.context_length': 8192 },
      }),
    } as any);
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'llama3');
    expect(result.contextLength).toBe(8192);
  });

  it('detects vision support from model_info keys', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model_info: { 'clip.vision.block_count': 24, 'llama.context_length': 4096 },
      }),
    } as any);
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'llava');
    expect(result.supportsVision).toBe(true);
  });

  it('falls back to num_ctx from parameters when model_info gives 4096', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model_info: {},
        parameters: 'num_ctx 16384\ntemperature 0.8',
      }),
    } as any);
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'llama3');
    expect(result.contextLength).toBe(16384);
  });

  it('detects thinking support from template .Think marker', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model_info: {},
        template: '{{- if .Think }}...',
      }),
    } as any);
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'qwen-thinking');
    expect(result.supportsThinking).toBe(true);
  });

  it('detects thinking support from modelfile RENDERER line', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model_info: {},
        modelfile: 'FROM qwen3.5\nRENDERER thinking\n',
      }),
    } as any);
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'qwen3.5');
    expect(result.supportsThinking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchLmStudioModelInfo
// ---------------------------------------------------------------------------

describe('fetchLmStudioModelInfo', () => {
  it('returns default fallback on fetch error', async () => {
    mockFetchError(new Error('network error'));
    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'llama3');
    expect(result).toEqual({ contextLength: 4096, supportsVision: false });
  });

  it('returns default fallback when response is not ok', async () => {
    mockFetch({ ok: false, json: async () => ({}) } as any);
    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'llama3');
    expect(result).toEqual({ contextLength: 4096, supportsVision: false });
  });

  it('returns default fallback when model not found in list', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ key: 'other-model', capabilities: {} }] }),
      } as any)
      .mockRejectedValueOnce(new Error('probe failed'));

    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'llama3');
    expect(result).toEqual({ contextLength: 4096, supportsVision: false });
  });

  it('extracts vision and tool capabilities', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{
            key: 'llava-7b',
            max_context_length: 8192,
            capabilities: { vision: true, trained_for_tool_use: true },
          }],
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: false,
      } as any);

    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'llava-7b');
    expect(result.supportsVision).toBe(true);
    expect(result.supportsToolCalling).toBe(true);
    expect(result.contextLength).toBe(8192);
  });
});

// ---------------------------------------------------------------------------
// fetchModelCapabilities
// ---------------------------------------------------------------------------

describe('fetchModelCapabilities', () => {
  const nameDetect = {
    vision: (id: string) => id.includes('vision'),
    toolCalling: (id: string) => id.includes('tool'),
  };

  it('returns ollama info when it has real data', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model_info: { 'llama.context_length': 8192 },
      }),
    } as any);

    const result = await fetchModelCapabilities('http://localhost:11434', 'llama3', nameDetect);
    expect(result.contextLength).toBe(8192);
  });

  it('falls back to name-based detection when neither API returns real data', async () => {
    mockFetchError(new Error('offline'));
    const result = await fetchModelCapabilities('http://localhost:11434', 'llava-vision-tool', nameDetect);
    expect(result.supportsVision).toBe(true);
    expect(result.supportsToolCalling).toBe(true);
    expect(result.contextLength).toBe(4096);
  });

  it('returns LM Studio info when Ollama returns defaults but LM Studio has real data', async () => {
    globalThis.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('ollama offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ key: 'llava', max_context_length: 8192, capabilities: { vision: true, trained_for_tool_use: false } }],
        }),
      } as any)
      .mockResolvedValueOnce({ ok: false } as any);

    const result = await fetchModelCapabilities('http://localhost:1234', 'llava', nameDetect);
    expect(result.supportsVision).toBe(true);
    expect(result.contextLength).toBe(8192);
  });
});

// ---------------------------------------------------------------------------
// fetchRemoteModelInfo — parseNumCtx edge cases
// ---------------------------------------------------------------------------

describe('fetchRemoteModelInfo — parseNumCtx edge cases', () => {
  it('returns 4096 when model_info empty and parameters has no num_ctx', async () => {
    mockFetch({
      ok: true,
      json: async () => ({ model_info: {}, parameters: 'temperature 0.8' }),
    } as any);
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'llama3');
    expect(result.contextLength).toBe(4096);
  });

  it('returns 4096 when model_info empty and no parameters field', async () => {
    mockFetch({
      ok: true,
      json: async () => ({ model_info: {} }),
    } as any);
    const result = await fetchRemoteModelInfo('http://localhost:11434', 'llama3');
    expect(result.contextLength).toBe(4096);
  });
});

// ---------------------------------------------------------------------------
// probeLmStudioThinking / deltaHasThinking — SSE parsing branches
// ---------------------------------------------------------------------------

describe('fetchLmStudioModelInfo — probeLmStudioThinking SSE branches', () => {
  const modelResponse = (key: string) => ({
    ok: true,
    json: async () => ({
      models: [{ key, max_context_length: 4096, capabilities: {} }],
    }),
  } as any);

  it('detects thinking via <think> in content delta', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(modelResponse('m1'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'data: {"choices":[{"delta":{"content":"<think>hi</think>"}}]}\ndata: [DONE]\n',
      } as any);
    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'm1');
    expect(result.supportsThinking).toBe(true);
  });

  it('detects thinking via reasoning_content delta', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(modelResponse('m2'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\ndata: [DONE]\n',
      } as any);
    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'm2');
    expect(result.supportsThinking).toBe(true);
  });

  it('detects thinking via reasoning delta', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(modelResponse('m3'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'data: {"choices":[{"delta":{"reasoning":"thought"}}]}\ndata: [DONE]\n',
      } as any);
    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'm3');
    expect(result.supportsThinking).toBe(true);
  });

  it('detects thinking via thinking delta', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(modelResponse('m4'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'data: {"choices":[{"delta":{"thinking":"thought"}}]}\ndata: [DONE]\n',
      } as any);
    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'm4');
    expect(result.supportsThinking).toBe(true);
  });

  it('returns supportsThinking=false when SSE has plain content only', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(modelResponse('m5'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'data: {"choices":[{"delta":{"content":"hello"}}]}\ndata: [DONE]\n',
      } as any);
    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'm5');
    expect(result.supportsThinking).toBe(false);
  });

  it('skips malformed JSON lines in SSE and returns false', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(modelResponse('m6'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'data: {bad json}\ndata: {"choices":[{"delta":{"content":"hi"}}]}\ndata: [DONE]\n',
      } as any);
    const result = await fetchLmStudioModelInfo('http://localhost:1234', 'm6');
    expect(result.supportsThinking).toBe(false);
  });
});
