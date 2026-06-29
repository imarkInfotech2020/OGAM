/**
 * ModelResidencyManager
 *
 * Keeps resident on-device models within a RAM budget. Callers ask to make a
 * model resident; the manager evicts others per `planEviction` (unloading via
 * each resident's registered unload fn) before loading the new one. Load/unload
 * are injected by the caller, so this stays decoupled from the text/image/
 * whisper/tts services and is unit-testable.
 *
 * See docs/design/MODEL_ROUTING.md §5.1–5.2.
 */
import { AppState } from 'react-native';
import { hardwareService } from '../hardware';
import logger from '../../utils/logger';
import { selectEvictionVictim, computeBudgetMB, Resident, ResidentType } from './policy';

type UnloadFn = () => Promise<void>;

/** Keep this much real RAM free for the OS and other apps (never hand it to models). */
const AVAILABILITY_HEADROOM_MB = 1024;
/** Hard floor so a small model can always load, even under memory pressure. */
const MIN_BUDGET_MB = 1024;
/** Small, cheaply-reloadable models reclaimed first under memory pressure. */
const SIDECAR_TYPES = new Set<ResidentType>(['whisper', 'tts', 'embedding']);

interface RegisteredResident extends Resident {
  unload: UnloadFn;
  /** Owner's veto: returns false when the model is in use right now (e.g. TTS is
   *  playing) so residency never evicts it mid-use. Absent → always evictable. */
  canEvict?: () => boolean;
}

export interface ResidentSpec {
  key: string;
  type: ResidentType;
  sizeMB: number;
  pinned?: boolean;
  /** Owner's veto: returns false while the model is in use (e.g. TTS playing) so
   *  residency never evicts it mid-use. Absent → always evictable. */
  canEvict?: () => boolean;
}

export interface EnsureResult {
  loaded: boolean;
  evicted: string[];
}

const stripUnload = ({ unload: _unload, ...rest }: RegisteredResident): Resident => rest;

class ModelResidencyManager {
  private readonly residents = new Map<string, RegisteredResident>();
  private budgetOverrideMB: number | null = null;

  constructor() {
    // Residency owns the memory-pressure response (single owner of model memory).
    // It used to be scattered — e.g. the Kokoro bridge had its own memoryWarning
    // listener freeing itself. Now one place reclaims idle models on a warning.
    try {
      AppState.addEventListener('memoryWarning', () => { this.handleMemoryWarning().catch(() => {}); });
    } catch { /* non-RN env (some tests) — no AppState */ }
  }

  /** Residents as the pure policy sees them, with a live `canEvict()===false`
   *  treated as pinned so capacity eviction never unloads a model that's in use. */
  private planningResidents(): Resident[] {
    return [...this.residents.values()].map(r => ({
      ...stripUnload(r),
      pinned: r.pinned || (r.canEvict ? !r.canEvict() : false),
    }));
  }

  /**
   * Memory-warning response: reclaim idle SIDECAR models (TTS/STT/embedding) —
   * small and cheap to reload — but never one whose owner vetoes via canEvict()
   * (e.g. TTS is actively playing). Generation models and pinned residents are
   * left alone. This is what the Kokoro bridge's own listener used to do, now
   * centralized so the eviction decision lives in one place.
   */
  async handleMemoryWarning(): Promise<void> {
    for (const [key, r] of [...this.residents.entries()]) {
      if (r.pinned || !SIDECAR_TYPES.has(r.type)) continue;
      if (r.canEvict && !r.canEvict()) continue; // in use — owner vetoes
      logger.log(`[ModelResidency] memory warning → reclaiming idle ${r.type} (${key})`);
      await r.unload().catch(err => logger.log(`[ModelResidency] memory-warning unload ${key} failed:`, err));
      this.residents.delete(key);
    }
  }

  /**
   * Global FIFO lock. Every model load/unload (text, image, whisper, tts,
   * classifier) runs through here, so only ONE heavy model operation touches
   * memory at a time. This is what makes the budget safe to enforce: makeRoomFor
   * + the actual load + register happen atomically, never racing a second load.
   *
   * Re-entrancy rule: an eviction unload (registered via `register`) runs INSIDE
   * a held lock, so it must be the NON-locking internal unload — it must never
   * call runExclusive again, or it deadlocks. Public load/unload methods acquire
   * the lock; the internal `_do…` variants they call do not.
   */
  private opChain: Promise<void> = Promise.resolve();

  async runExclusive<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.opChain;
    let release: () => void = () => {};
    this.opChain = new Promise<void>(resolve => {
      release = resolve;
    });
    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Force a specific budget (tests / low-memory tuning). null → derive from device RAM. */
  setBudgetOverrideMB(mb: number | null): void {
    this.budgetOverrideMB = mb;
  }

  getBudgetMB(): number {
    if (this.budgetOverrideMB != null) return this.budgetOverrideMB;
    // Two caps, take the smaller:
    //  - physical: a fraction of total RAM (the absolute ceiling).
    //  - dynamic: real free RAM right now + what our own resident models would
    //    free if evicted, minus headroom. This is what stops loading into swap —
    //    the physical cap alone trusted total RAM the device didn't actually have
    //    free (the OOM-freeze cause). Floored so a small model always loads.
    const physicalCapMB = computeBudgetMB(hardwareService.getTotalMemoryGB() * 1024);
    const availableMB = hardwareService.getAvailableMemoryGB() * 1024;
    const residentMB = [...this.residents.values()].reduce((sum, r) => sum + r.sizeMB, 0);
    const dynamicMB = availableMB + residentMB - AVAILABILITY_HEADROOM_MB;
    return Math.round(Math.max(MIN_BUDGET_MB, Math.min(physicalCapMB, dynamicMB)));
  }

  getResidents(): Resident[] {
    return [...this.residents.values()].map(stripUnload);
  }

  isResident(key: string): boolean {
    return this.residents.has(key);
  }

  /**
   * Whether `spec` fits the budget alongside everything already resident,
   * WITHOUT evicting anything. Used by the boot preloader so warming a
   * lower-priority model never kicks out a higher-priority one.
   */
  canLoadWithoutEviction(spec: { key: string; sizeMB: number }): boolean {
    if (this.residents.has(spec.key)) return true;
    const usedMB = [...this.residents.values()].reduce((sum, r) => sum + r.sizeMB, 0);
    return usedMB + spec.sizeMB <= this.getBudgetMB();
  }

  markUsed(key: string, now: number = Date.now()): void {
    const r = this.residents.get(key);
    if (r) r.lastUsedAt = now;
  }

  /**
   * Register a model that's already loaded elsewhere (e.g. a pinned classifier
   * or a model loaded before the manager existed) so it's accounted for.
   */
  register(spec: ResidentSpec, unload: UnloadFn, now: number = Date.now()): void {
    this.residents.set(spec.key, { ...spec, lastUsedAt: now, unload });
  }

  /**
   * Make `spec` resident, evicting others to fit the budget. `load` runs only
   * if the model isn't already resident; `unload` is stored for future eviction.
   */
  /**
   * Evict residents (per the budget + mutual-exclusion policy) to make room for
   * `spec`, WITHOUT loading it. For callers that own the actual load themselves
   * (e.g. activeModelService) but want the manager to enforce memory. Returns
   * the evicted keys.
   */
  async makeRoomFor(spec: ResidentSpec): Promise<{ evicted: string[]; fits: boolean }> {
    // Re-read real free RAM so the decision reflects current pressure, not a stale
    // boot-time snapshot (other apps may have grabbed memory since).
    await hardwareService.refreshMemoryInfo().catch(() => {});

    if (this.residents.has(spec.key)) {
      logger.log(`[MEM-SM] makeRoomFor ${spec.key} already resident → fits`);
      return { evicted: [], fits: true };
    }

    // Absolute ceiling: the most RAM we'd EVER commit to a single model on this
    // device (physical cap, or the test override). If the model alone exceeds it,
    // it can NEVER fit no matter what we evict — so refuse WITHOUT evicting, rather
    // than strand the device by freeing a resident for a load guaranteed to fail.
    // This is what correctly refuses E4B (8.5GB) / SDXL (7.3GB) on a tight device.
    const ceilingMB = this.budgetOverrideMB ?? computeBudgetMB(hardwareService.getTotalMemoryGB() * 1024);
    if (spec.sizeMB > ceilingMB) {
      logger.log(`[MEM-SM] makeRoomFor ${spec.key} sizeMB=${spec.sizeMB} ceilingMB=${Math.round(ceilingMB)} → too big to EVER fit, refusing without eviction`);
      return { evicted: [], fits: false };
    }

    // Does it fit RIGHT NOW (in real free RAM, alongside everything resident)? If
    // so, evict nothing — this is how text+image stay co-resident for enhancement.
    const fits = (): boolean => {
      const usedMB = [...this.residents.values()].reduce((sum, r) => sum + r.sizeMB, 0);
      return usedMB + spec.sizeMB <= this.getBudgetMB();
    };

    // Measure-after-evict (NOT predict): the resident-size estimates undercount
    // palettized image models 3-4× (tiny compressed file, large runtime footprint),
    // so a prediction wrongly concludes a small text model won't fit. Instead evict
    // the lowest-priority victim, let the OS reclaim, re-read REAL free RAM, re-check.
    // planningResidents() pins anything whose owner vetoes eviction right now
    // (canEvict()===false, e.g. TTS playing) so an in-use model is never freed.
    const evicted: string[] = [];
    while (!fits()) {
      const victim = selectEvictionVictim(this.planningResidents(), spec, () => false);
      if (!victim) break; // nothing evictable left (all pinned / in-use / sidecar rule) → bail
      const reg = this.residents.get(victim.key);
      if (!reg) break;
      await reg.unload().catch(err => logger.log(`[ModelResidency] unload ${victim.key} failed:`, err));
      this.residents.delete(victim.key);
      evicted.push(victim.key);
      await hardwareService.refreshMemoryInfo().catch(() => {}); // real freed RAM now visible
    }

    const finalFits = fits();
    // [MEM-SM] trace (kept forever): the exact numbers behind every fit decision,
    // so "not enough memory" is never a mystery (real per-process budget vs the
    // model estimate vs what was actually evicted).
    logger.log(`[MEM-SM] makeRoomFor ${spec.key} sizeMB=${spec.sizeMB} budgetMB=${this.getBudgetMB()} ceilingMB=${Math.round(ceilingMB)} evicted=[${evicted.join(',')}] fits=${finalFits}`);
    return { evicted, fits: finalFits };
  }

  async ensureResident(
    spec: ResidentSpec,
    handlers: { load: () => Promise<void>; unload: UnloadFn },
    now: number = Date.now(),
  ): Promise<EnsureResult> {
    const { evicted } = await this.makeRoomFor(spec);

    if (this.residents.has(spec.key)) {
      this.markUsed(spec.key, now);
      return { loaded: false, evicted };
    }

    await handlers.load();
    this.residents.set(spec.key, { ...spec, lastUsedAt: now, unload: handlers.unload });
    return { loaded: true, evicted };
  }

  /** Forget a resident the owner has already unloaded (no unload call). */
  release(key: string): void {
    this.residents.delete(key);
  }

  /**
   * A generation turn is starting: the mic (STT/Whisper) model is idle while the
   * LLM runs, and its RAM is better spent on the LLM's inference working set (which
   * the file-size budget doesn't capture). On a memory-tight device, free it so the
   * generation working set doesn't tip the app past the jetsam limit (the 4GB
   * resend OOM). STT reloads on the next record. Roomy devices keep it warm.
   * Centralizes the "evict idle audio sidecar for generation" decision here.
   */
  async reclaimSttForGeneration(): Promise<void> {
    // Best-effort memory optimization in the generation hot path — must NEVER throw
    // into it (e.g. if the hardware service isn't available). Bail quietly instead.
    let totalGB: number;
    try { totalGB = hardwareService.getTotalMemoryGB(); } catch { return; }
    if (totalGB > 6) return; // roomy: keep STT warm
    const w = this.residents.get('whisper');
    if (!w) return;
    logger.log('[ModelResidency] reclaiming idle STT for generation turn (memory-tight)');
    await w.unload().catch(err => logger.log('[ModelResidency] STT reclaim failed:', err));
    this.residents.delete('whisper');
  }

  /** Evict everything except pinned residents (e.g. on memory-warning). */
  async evictAll(includePinned = false): Promise<void> {
    for (const [key, reg] of [...this.residents.entries()]) {
      if (reg.pinned && !includePinned) continue;
      await reg.unload().catch(err => logger.log(`[ModelResidency] unload ${key} failed:`, err));
      this.residents.delete(key);
    }
  }

  /** Test helper. */
  _reset(): void {
    this.residents.clear();
    this.budgetOverrideMB = null;
    this.opChain = Promise.resolve();
  }
}

export const modelResidencyManager = new ModelResidencyManager();
export type { Resident, ResidentType } from './policy';
