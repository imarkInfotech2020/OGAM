/**
 * Hardware-acceleration eligibility — the SINGLE source of truth for "can this
 * model actually use the GPU/NPU?".
 *
 * Grounded in what llama.rn / llama.cpp actually accelerate on-device:
 *  - HTP/Hexagon NPU repacks only Q4_0, Q8_0 (and MXFP4). A K-quant (Q4_K_M)
 *    loads but silently runs on CPU — no speedup.
 *  - The Adreno OpenCL GPU backend is optimized for Q4_0 (llama.rn restricts it to
 *    Q4_0/Q6_K).
 *  - LiteRT (.litertlm) models run on the GPU natively.
 * So the accelerable GGUF quants are Q4_0 / Q8_0; LiteRT files are always GPU.
 * See docs/plans/best-backend-per-device.md and the HTP/OpenCL research.
 */
import { ModelInfo, ModelFile, InferenceBackend, INFERENCE_BACKENDS } from '../types';

/** GGUF quantizations the NPU (HTP) / GPU (OpenCL) backends actually accelerate. */
export const ACCELERABLE_QUANTS = ['Q4_0', 'Q8_0'] as const;

/** True when a GGUF quant is one the NPU/GPU backends accelerate (not a K-quant). */
export function isAccelerableQuant(quant: string | undefined | null): boolean {
  if (!quant) return false;
  const q = quant.toUpperCase();
  return ACCELERABLE_QUANTS.some(a => a === q);
}

/** A LiteRT model file runs on the GPU regardless of GGUF quant. */
function isLiteRTFile(file: ModelFile): boolean {
  return file.name.toLowerCase().endsWith('.litertlm') || file.quantization?.toLowerCase() === 'litert';
}

/**
 * Whether a model can run on the GPU/NPU: it ships a LiteRT file, or a GGUF file in
 * an accelerable quant (Q4_0/Q8_0) the user can pick. A model that only offers
 * K-quants (Q4_K_M) returns false — enabling NPU/GPU for it would silently fall
 * back to CPU, so we neither badge nor prioritize it.
 */
export function modelSupportsNpuGpu(model: Pick<ModelInfo, 'files'>): boolean {
  return (model.files ?? []).some(f => isLiteRTFile(f) || isAccelerableQuant(f.quantization));
}

/** The device's llama.rn acceleration options (from hardwareService.getAccelerationCapability). */
export interface AccelerationCapability {
  hasNpu: boolean;
  hasGpu: boolean;
}

/** A downloaded llama model that can actually use the NPU/GPU (accelerable quant). */
export function isDownloadedModelAccelerable(m: { engine?: string; quantization?: string }): boolean {
  return m.engine === 'llama' && isAccelerableQuant(m.quantization);
}

/** The first accelerable downloaded llama model other than the active one, if any. */
export function findAccelerableModel<T extends { id: string; name: string; engine?: string; quantization?: string }>(
  models: T[],
  excludeId: string | undefined,
): T | null {
  return models.find(m => m.id !== excludeId && isDownloadedModelAccelerable(m)) ?? null;
}

/**
 * What the chat acceleration tip should offer, given the device, the active model, and
 * what's already downloaded:
 *  - `enable`   — on CPU with an already-accelerable model (Q4_0/Q8_0); just flip the
 *                 backend to NPU/GPU for a real speedup.
 *  - `switch`   — the active model is a K-quant (which can't use the NPU/GPU) but an
 *                 accelerable model is already downloaded; switch to it (and set the
 *                 backend so it loads on the accelerator).
 *  - `download` — a K-quant is active and no accelerable model exists locally; send the
 *                 user to grab a Q4_0 build.
 *  - `hidden`   — remote/LiteRT model, no NPU/GPU, or genuinely accelerated already.
 *
 * `fellBack` distinguishes the two ways `switch`/`download` arise: on CPU it's a "go
 * faster" nudge; when the user HAS selected NPU/GPU but the active K-quant can't use it
 * (so llama.cpp silently repacks to CPU), it's a "we're on CPU" warning. Same decision,
 * different copy — this is what surfaces the otherwise-silent CPU fallback.
 */
export type AccelerationAction = 'enable' | 'switch' | 'download' | 'hidden';

export interface AccelerationPlan {
  action: AccelerationAction;
  /** True when an accelerated backend is selected but the active model can't use it. */
  fellBack: boolean;
  /** For `switch`: the downloaded accelerable model to activate. */
  targetModelId?: string;
  targetModelName?: string;
}

function isAcceleratedBackend(backend: InferenceBackend | undefined): boolean {
  return backend === INFERENCE_BACKENDS.HTP || backend === INFERENCE_BACKENDS.OPENCL;
}

export function planAcceleration(params: {
  engine: string | undefined;
  isRemote: boolean;
  inferenceBackend: InferenceBackend | undefined;
  capability: AccelerationCapability;
  activeQuant: string | undefined;
  downloadedAccelerable: { id: string; name: string } | null;
}): AccelerationPlan {
  const { engine, isRemote, inferenceBackend, capability, activeQuant, downloadedAccelerable } = params;
  const hidden: AccelerationPlan = { action: 'hidden', fellBack: false };
  if (isRemote || engine !== 'llama') return hidden;
  if (!capability.hasNpu && !capability.hasGpu) return hidden;

  const accelerated = isAcceleratedBackend(inferenceBackend);
  const activeAccelerable = isAccelerableQuant(activeQuant);
  // Genuinely accelerated (accelerated backend + a model that can use it) → nothing to do.
  if (accelerated && activeAccelerable) return hidden;
  // On CPU with an accelerable model → offer to turn the accelerator on.
  if (!accelerated && activeAccelerable) return { action: 'enable', fellBack: false };

  // Remaining: the active model is a K-quant. Either the user is on CPU (a nudge) or has
  // selected NPU/GPU that silently repacked to CPU (a fallback warning). Route them to an
  // accelerable model — switch to one they have, else download.
  const fellBack = accelerated;
  if (downloadedAccelerable) {
    return { action: 'switch', fellBack, targetModelId: downloadedAccelerable.id, targetModelName: downloadedAccelerable.name };
  }
  return { action: 'download', fellBack };
}

/** The backend to switch to when the user accepts the tip: prefer the NPU, else the GPU. */
export function acceleratedBackendFor(capability: AccelerationCapability): InferenceBackend {
  return capability.hasNpu ? INFERENCE_BACKENDS.HTP : INFERENCE_BACKENDS.OPENCL;
}

/**
 * The HuggingFace search term to prefill on the Models tab so the user can grab an
 * accelerable (Q4_0) build of the model they're on. Strips a trailing quant suffix
 * (…-Q4_K_M) from the model id and its author prefix, then appends the target quant.
 */
export function acceleratedSearchQuery(modelId: string | undefined | null): string {
  if (!modelId) return 'Q4_0';
  const base = modelId.split('/').pop() ?? modelId;
  const withoutQuant = base.replace(/[-_.]?Q\d[_.].*$/i, '').replace(/[-_.]?(gguf|litertlm)$/i, '');
  return `${withoutQuant.trim()} Q4_0`.trim();
}
