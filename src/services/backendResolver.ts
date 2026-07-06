/**
 * Backend resolver — the SINGLE place the "which inference backend should we
 * default to on this device" decision lives, as a PURE function of declared
 * capabilities. Views and the boot sync depend on this, never on scattered
 * `Platform.OS`/GPU branches.
 *
 * Rules:
 *  - iOS always defaults to Metal (the GPU path is the right default there).
 *  - Android defaults to OpenCL (the GPU path) when the device supports it,
 *    otherwise CPU.
 *
 * The static store default stays CPU on Android as a safe fallback; this
 * resolver upgrades it at boot (see backendSync) when the GPU is available so
 * users' GPUs are actually used instead of sitting idle.
 */
import { InferenceBackend, LiteRTBackend, INFERENCE_BACKENDS } from '../types';

/** Declared device capabilities the default depends on. */
export interface BackendCapabilities {
  platform: 'ios' | 'android';
  openCLSupported: boolean;
}

/** The one platform+capability -> llama inference backend mapping. */
export function resolveDefaultBackend(caps: BackendCapabilities): InferenceBackend {
  if (caps.platform === 'ios') return INFERENCE_BACKENDS.METAL;
  return caps.openCLSupported ? INFERENCE_BACKENDS.OPENCL : INFERENCE_BACKENDS.CPU;
}

/** The one capability -> LiteRT backend mapping (GPU when OpenCL is available). */
export function resolveDefaultLiteRTBackend(caps: BackendCapabilities): LiteRTBackend {
  return caps.openCLSupported ? 'gpu' : 'cpu';
}
