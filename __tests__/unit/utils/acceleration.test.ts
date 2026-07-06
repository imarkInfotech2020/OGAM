import {
  isAccelerableQuant,
  modelSupportsNpuGpu,
  isDownloadedModelAccelerable,
  findAccelerableModel,
  planAcceleration,
  acceleratedBackendFor,
  acceleratedSearchQuery,
} from '../../../src/utils/acceleration';
import { INFERENCE_BACKENDS } from '../../../src/types';

const file = (name: string, quantization: string) => ({ name, size: 1, quantization, downloadUrl: '' });

describe('isAccelerableQuant', () => {
  it('accepts the NPU/GPU-accelerable GGUF quants (case-insensitive)', () => {
    expect(isAccelerableQuant('Q4_0')).toBe(true);
    expect(isAccelerableQuant('q4_0')).toBe(true);
    expect(isAccelerableQuant('Q8_0')).toBe(true);
  });

  it('rejects K-quants and unknowns (they silently fall back to CPU)', () => {
    expect(isAccelerableQuant('Q4_K_M')).toBe(false);
    expect(isAccelerableQuant('Q6_K')).toBe(false);
    expect(isAccelerableQuant('Unknown')).toBe(false);
    expect(isAccelerableQuant(undefined)).toBe(false);
    expect(isAccelerableQuant('')).toBe(false);
  });
});

describe('modelSupportsNpuGpu', () => {
  it('true when the model offers a Q4_0 or Q8_0 GGUF file', () => {
    expect(modelSupportsNpuGpu({ files: [file('m-Q4_K_M.gguf', 'Q4_K_M'), file('m-Q4_0.gguf', 'Q4_0')] })).toBe(true);
    expect(modelSupportsNpuGpu({ files: [file('m-Q8_0.gguf', 'Q8_0')] })).toBe(true);
  });

  it('true for a LiteRT model (runs on GPU regardless of quant)', () => {
    expect(modelSupportsNpuGpu({ files: [file('gemma-4-E2B-it.litertlm', 'LiteRT')] })).toBe(true);
    expect(modelSupportsNpuGpu({ files: [file('x.litertlm', 'Unknown')] })).toBe(true);
  });

  it('false when the model only offers K-quants (no acceleration)', () => {
    expect(modelSupportsNpuGpu({ files: [file('m-Q4_K_M.gguf', 'Q4_K_M'), file('m-Q6_K.gguf', 'Q6_K')] })).toBe(false);
  });

  it('false when there are no files', () => {
    expect(modelSupportsNpuGpu({ files: [] })).toBe(false);
    expect(modelSupportsNpuGpu({ files: undefined as never })).toBe(false);
  });
});

describe('isDownloadedModelAccelerable / findAccelerableModel', () => {
  const m = (id: string, engine: string, quantization: string) => ({ id, name: id, engine, quantization });

  it('true only for llama models in an accelerable quant', () => {
    expect(isDownloadedModelAccelerable({ engine: 'llama', quantization: 'Q4_0' })).toBe(true);
    expect(isDownloadedModelAccelerable({ engine: 'llama', quantization: 'Q4_K_M' })).toBe(false);
    expect(isDownloadedModelAccelerable({ engine: 'litert', quantization: 'Q4_0' })).toBe(false);
  });

  it('finds the first accelerable model, skipping the active one', () => {
    const models = [m('a-Q4_K_M', 'llama', 'Q4_K_M'), m('b-Q4_0', 'llama', 'Q4_0'), m('c-Q8_0', 'llama', 'Q8_0')];
    expect(findAccelerableModel(models, 'a-Q4_K_M')?.id).toBe('b-Q4_0');
    // excludes the active model even when it is itself accelerable
    expect(findAccelerableModel(models, 'b-Q4_0')?.id).toBe('c-Q8_0');
    expect(findAccelerableModel([m('a', 'llama', 'Q4_K_M')], 'x')).toBeNull();
  });
});

describe('planAcceleration', () => {
  const base = {
    engine: 'llama', isRemote: false, inferenceBackend: INFERENCE_BACKENDS.CPU,
    capability: { hasNpu: true, hasGpu: false }, activeQuant: 'Q4_K_M', downloadedAccelerable: null,
  };

  it('enable: the active model is already an accelerable quant', () => {
    expect(planAcceleration({ ...base, activeQuant: 'Q4_0' }).action).toBe('enable');
    expect(planAcceleration({ ...base, activeQuant: 'Q8_0' }).action).toBe('enable');
  });

  it('switch: K-quant active but an accelerable model is already downloaded', () => {
    const plan = planAcceleration({ ...base, downloadedAccelerable: { id: 'x/Qwen-Q4_0', name: 'Qwen Q4_0' } });
    expect(plan.action).toBe('switch');
    expect(plan.targetModelId).toBe('x/Qwen-Q4_0');
    expect(plan.targetModelName).toBe('Qwen Q4_0');
  });

  it('download: K-quant active and nothing accelerable downloaded', () => {
    expect(planAcceleration(base).action).toBe('download');
  });

  it('hidden once already on an accelerated backend', () => {
    expect(planAcceleration({ ...base, inferenceBackend: INFERENCE_BACKENDS.HTP }).action).toBe('hidden');
  });

  it('hidden when the device has neither NPU nor GPU', () => {
    expect(planAcceleration({ ...base, capability: { hasNpu: false, hasGpu: false } }).action).toBe('hidden');
  });

  it('hidden for LiteRT and remote models', () => {
    expect(planAcceleration({ ...base, engine: 'litert' }).action).toBe('hidden');
    expect(planAcceleration({ ...base, isRemote: true }).action).toBe('hidden');
    expect(planAcceleration({ ...base, engine: undefined }).action).toBe('hidden');
  });
});

describe('acceleratedBackendFor', () => {
  it('prefers the NPU (HTP) when available, else the GPU (OpenCL)', () => {
    expect(acceleratedBackendFor({ hasNpu: true, hasGpu: true })).toBe(INFERENCE_BACKENDS.HTP);
    expect(acceleratedBackendFor({ hasNpu: false, hasGpu: true })).toBe(INFERENCE_BACKENDS.OPENCL);
  });
});

describe('acceleratedSearchQuery', () => {
  it('strips the author prefix and quant suffix, then appends Q4_0', () => {
    expect(acceleratedSearchQuery('unsloth/Qwen3-4B-Instruct-Q4_K_M')).toBe('Qwen3-4B-Instruct Q4_0');
    expect(acceleratedSearchQuery('org/gemma-3-4b-it')).toBe('gemma-3-4b-it Q4_0');
  });

  it('falls back to a bare Q4_0 search when the id is missing', () => {
    expect(acceleratedSearchQuery(undefined)).toBe('Q4_0');
    expect(acceleratedSearchQuery(null)).toBe('Q4_0');
  });
});
