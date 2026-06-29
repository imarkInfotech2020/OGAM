/**
 * Memory budget — the SINGLE source of truth for "how much RAM this process may
 * safely commit to on-device models" on THIS device + platform.
 *
 * Both consumers read it so they can never disagree (one saying a model fits
 * while the other rejects it):
 *  - the residency manager (capacity planning + eviction), and
 *  - the pre-load memory check (checkMemoryForModel).
 *
 * Why a fraction of RAM at all: iOS jetsam / Android's low-memory killer terminate
 * a process that commits too much. The safe fraction is NOT flat:
 *  - low-RAM devices must stay well under the kill line (the fixed ~1.5GB OS+app
 *    baseline is a big slice of 4GB), so the fraction is small;
 *  - high-RAM devices can use a larger fraction (that fixed baseline is a small
 *    slice of 12GB), and on iOS we hold com.apple.developer.kernel.increased-
 *    memory-limit, which raises the per-process cap well above the default — so a
 *    12GB iPhone can safely run a 7GB model that a flat 60% cap wrongly rejected.
 *
 * Previously two places computed this independently (a 0.6 fraction in the
 * residency policy AND a separate 0.6 in the model-load check) and a flat 60% was
 * applied to every device above 4GB — treating a 12GB iPhone like a 6GB one.
 */
import { Platform } from 'react-native';

/** Never commit the last ~1.5GB — OS + app baseline must always have headroom. */
export const MEMORY_RESERVE_MB = 1500;

type Plat = 'ios' | 'android' | string;

/** Safe fraction of total RAM this process may commit to models, by device tier.
 *  ≤8GB tiers are unchanged from the prior flat behavior; only high-RAM devices
 *  (the new 12GB+ flagships) get a larger, platform-aware fraction. */
export function modelBudgetFraction(totalRamGB: number, platform: Plat = Platform.OS): number {
  if (totalRamGB <= 4) return 0.40; // 4GB: must stay well under jetsam
  if (totalRamGB <= 8) return 0.60; // 6-8GB: unchanged
  return platform === 'ios' ? 0.78 : 0.70; // 12GB+: iOS holds the increased-memory entitlement
}

/** Fraction at which we WARN (load allowed, perf may suffer). Below the budget. */
export function modelWarningFraction(totalRamGB: number, platform: Plat = Platform.OS): number {
  if (totalRamGB <= 4) return 0.30;
  if (totalRamGB <= 8) return 0.50;
  return platform === 'ios' ? 0.66 : 0.60;
}

/** Hard budget in MB: the smaller of the fraction-of-RAM and (RAM minus reserve). */
export function modelMemoryBudgetMB(totalRamMB: number, platform: Plat = Platform.OS): number {
  const totalRamGB = totalRamMB / 1024;
  const byFraction = totalRamMB * modelBudgetFraction(totalRamGB, platform);
  const byReserve = totalRamMB - MEMORY_RESERVE_MB;
  return Math.max(0, Math.min(byFraction, byReserve));
}

/** Warning threshold in MB (always ≤ the hard budget). */
export function modelWarningThresholdMB(totalRamMB: number, platform: Plat = Platform.OS): number {
  const totalRamGB = totalRamMB / 1024;
  const byFraction = totalRamMB * modelWarningFraction(totalRamGB, platform);
  return Math.min(byFraction, modelMemoryBudgetMB(totalRamMB, platform));
}
