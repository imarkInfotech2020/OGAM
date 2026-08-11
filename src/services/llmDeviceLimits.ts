import { Platform } from 'react-native';

/**
 * How much of THIS device a model may use.
 *
 * One question - what will fit here - answered from the device's own memory and nothing else. It
 * lived among the llama.rn context helpers, which made a pure sizing rule look like an engine
 * detail and put every caller of `BYTES_PER_GB` through a module that loads the native binding.
 *
 * Pure by design: no engine, no context, no I/O. That is what makes the caps testable at all.
 */

/** Max safe context length based on device RAM to prevent OOM on low-RAM devices. */
export const BYTES_PER_GB = 1024 * 1024 * 1024;
export function getMaxContextForDevice(totalMemoryBytes: number): number {
  const gb = totalMemoryBytes / BYTES_PER_GB;
  if (gb <= 6) return 2048;
  if (gb <= 8) return 4096;
  return 8192;
}
// Android Adreno GPU caps (≤4GB/≤6GB→0, ≤8GB→12, >8GB→24).
const ANDROID_GPU_LAYER_CAPS: { maxGB: number; layers: number }[] = [{ maxGB: 4, layers: 0 }, { maxGB: 6, layers: 0 }, { maxGB: 8, layers: 12 }];
const ANDROID_GPU_LAYERS_FALLBACK = 24;

/**
 * iOS Metal uses UNIFIED memory: offloaded weights + the compute-graph
 * (sched_reserve) buffer + KV all draw from system RAM. Full offload (99 layers)
 * of a non-trivial model on a memory-tight device overflows the Metal allocation
 * → null buffer → SIGSEGV in lm_ggml_backend_metal_buffer_type_*alloc_buffer (the
 * #1 crash). Cap the offloaded layers so the weights fit free RAM minus a reserve
 * for the compute graph + KV + the app/OS. RESERVE is the tuning knob: raise it if
 * crashes persist on a device, lower it to claw back GPU speed.
 */
const IOS_METAL_RESERVE_BYTES = 1.6 * BYTES_PER_GB;

/** Safe GPU layer count for the device + model. Skips GPU on ≤4 GB to prevent abort();
 *  caps iOS Metal offload to what fits free RAM so the buffer alloc can't overflow. */
export function getGpuLayersForDevice(
  totalMemoryBytes: number,
  requestedLayers: number,
  opts?: { modelBytes?: number; availableBytes?: number },
): number {
  const totalGB = totalMemoryBytes / BYTES_PER_GB;
  if (totalGB <= 4) return 0;

  // Android / Adreno-specific caps to prevent GPU ANRs
  if (Platform.OS === 'android') {
    const tier = ANDROID_GPU_LAYER_CAPS.find(t => totalGB <= t.maxGB);
    const maxLayers = tier ? tier.layers : ANDROID_GPU_LAYERS_FALLBACK;
    return Math.min(requestedLayers, maxLayers);
  }

  // iOS: cap Metal offload by free RAM vs model size (see IOS_METAL_RESERVE_BYTES).
  if (Platform.OS === 'ios' && opts?.modelBytes && opts?.availableBytes) {
    const weightBudget = opts.availableBytes - IOS_METAL_RESERVE_BYTES;
    if (weightBudget <= 0) return 0; // no headroom → run on CPU rather than crash
    if (opts.modelBytes <= weightBudget) return requestedLayers; // fits → full offload
    return Math.max(0, Math.floor(requestedLayers * (weightBudget / opts.modelBytes)));
  }
  return requestedLayers;
}
