/**
 * How many cores are worth running inference on, from the kernel's own view of the CPU.
 *
 * Pure: it takes one number per core — the scheduler's `cpu_capacity` (0-1024) or, on kernels that
 * don't publish that, `cpuinfo_max_freq` — and answers with a count. No IO, so the rule can be read
 * and tested on real device topologies instead of guessed at.
 *
 * The rule is "the largest cluster among the FAST cores", and both halves earn their place. A
 * phone is not big.LITTLE any more, it is three tiers; on the OnePlus CPH2707 the capacities are
 *
 *     380 380 380   873 873 873 873   1024
 *     3 efficiency  4 performance     1 prime
 *
 * - Counting only the maximum gives 1 (the prime core alone) — far too few threads.
 * - Counting everything fast gives 5 (prime + performance). The prime core shares thermal and cache
 *   budget with the performance cluster and the scheduler migrates work off it under sustained load,
 *   so the extra thread costs throughput rather than adding it — measured on device.
 * - The largest fast cluster gives 4, which is what the device actually runs fastest on.
 *
 * It lands correctly on the other shapes too: 4+4 big.LITTLE gives 4, a 2+6 gives 2, and a uniform
 * 8-core gives 8. Efficiency cores are never included — over-threading onto them is slower than not
 * using them at all, which is the whole reason this function exists.
 */

/** A core is "fast" if it is within this fraction of the fastest core. Set from real silicon: the
 *  performance cluster sits at 0.85 of the prime core on Snapdragon 8-class parts, and the
 *  efficiency cluster is far below (0.37 on the CPH2707), so the gap is wide and unambiguous. */
const FAST_CORE_THRESHOLD = 0.85;

export function performanceCoreCount(coreValues: readonly number[]): number {
  const usable = coreValues.filter(value => Number.isFinite(value) && value > 0);
  if (usable.length === 0) return 0;
  const fastest = Math.max(...usable);
  const clusterSizes = new Map<number, number>();
  for (const value of usable) {
    if (value < fastest * FAST_CORE_THRESHOLD) continue; // an efficiency core: never a worker
    clusterSizes.set(value, (clusterSizes.get(value) ?? 0) + 1);
  }
  return Math.max(...clusterSizes.values());
}
