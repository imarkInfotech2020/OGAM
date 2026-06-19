/**
 * Model residency policy (pure functions).
 *
 * Decides which on-device models stay in RAM. A phone can't hold every model
 * at once, so before loading a model we evict others to fit a RAM budget:
 *  - generation models (text / image) are mutually exclusive — one resident;
 *  - pinned models (e.g. the ~100MB SMOL classifier) are never evicted;
 *  - otherwise evict least-recently-used until the incoming model fits.
 *
 * See docs/design/MODEL_ROUTING.md §4–5.2. Pure + deterministic so the policy
 * can be unit-tested without touching native model loading.
 */

export type ResidentType = 'text' | 'image' | 'whisper' | 'tts' | 'classifier';

export interface Resident {
  /** Unique model id. */
  key: string;
  type: ResidentType;
  /** Approximate resident memory cost in MB. */
  sizeMB: number;
  /** Pinned residents are never evicted (e.g. the classifier). */
  pinned?: boolean;
  /** Epoch ms of last use, for LRU. */
  lastUsedAt: number;
}

export interface IncomingModel {
  key: string;
  type: ResidentType;
  sizeMB: number;
}

export interface EvictionPlan {
  /** Residents to unload, in eviction order. */
  evict: Resident[];
  /** Whether the incoming model fits the budget after eviction. */
  fits: boolean;
  freedMB: number;
}

/** Generation targets are mutually exclusive — at most one resident at a time. */
const GENERATION_TYPES: readonly ResidentType[] = ['text', 'image'];

const isGeneration = (t: ResidentType): boolean => GENERATION_TYPES.includes(t);

/**
 * Compute a RAM budget for resident models from total device RAM, leaving
 * headroom for the OS and the rest of the app.
 */
export function computeBudgetMB(
  totalRamMB: number,
  opts?: { reserveMB?: number; fraction?: number },
): number {
  const fraction = opts?.fraction ?? 0.6;
  const reserveMB = opts?.reserveMB ?? 1500;
  return Math.max(0, Math.min(totalRamMB * fraction, totalRamMB - reserveMB));
}

/**
 * Plan which residents to evict so `incoming` fits within `budgetMB`.
 * Never evicts pinned residents or the incoming model itself.
 */
export function planEviction(
  current: Resident[],
  incoming: IncomingModel,
  budgetMB: number,
): EvictionPlan {
  const evict: Resident[] = [];
  const isEvicted = (r: Resident) => evict.some(e => e.key === r.key);
  const alreadyResident = current.some(r => r.key === incoming.key);

  // 1. A new generation model evicts any other resident generation model.
  if (isGeneration(incoming.type)) {
    for (const r of current) {
      if (r.key !== incoming.key && isGeneration(r.type) && !r.pinned) evict.push(r);
    }
  }

  const usedMB = () =>
    current
      .filter(r => r.key !== incoming.key && !isEvicted(r))
      .reduce((sum, r) => sum + r.sizeMB, 0);
  const incomingCostMB = alreadyResident ? 0 : incoming.sizeMB;

  // 2. Evict least-recently-used (non-pinned) until the incoming model fits.
  while (usedMB() + incomingCostMB > budgetMB) {
    const candidate = current
      .filter(r => !r.pinned && r.key !== incoming.key && !isEvicted(r))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
    if (!candidate) break; // nothing left to evict
    evict.push(candidate);
  }

  return {
    evict,
    fits: usedMB() + incomingCostMB <= budgetMB,
    freedMB: evict.reduce((sum, r) => sum + r.sizeMB, 0),
  };
}
