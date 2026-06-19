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
import { hardwareService } from '../hardware';
import logger from '../../utils/logger';
import { planEviction, computeBudgetMB, Resident, ResidentType } from './policy';

type UnloadFn = () => Promise<void>;

interface RegisteredResident extends Resident {
  unload: UnloadFn;
}

export interface ResidentSpec {
  key: string;
  type: ResidentType;
  sizeMB: number;
  pinned?: boolean;
}

export interface EnsureResult {
  loaded: boolean;
  evicted: string[];
}

const stripUnload = ({ unload: _unload, ...rest }: RegisteredResident): Resident => rest;

class ModelResidencyManager {
  private readonly residents = new Map<string, RegisteredResident>();
  private budgetOverrideMB: number | null = null;

  /** Force a specific budget (tests / low-memory tuning). null → derive from device RAM. */
  setBudgetOverrideMB(mb: number | null): void {
    this.budgetOverrideMB = mb;
  }

  getBudgetMB(): number {
    if (this.budgetOverrideMB != null) return this.budgetOverrideMB;
    return computeBudgetMB(hardwareService.getTotalMemoryGB() * 1024);
  }

  getResidents(): Resident[] {
    return [...this.residents.values()].map(stripUnload);
  }

  isResident(key: string): boolean {
    return this.residents.has(key);
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
    const plan = planEviction(this.getResidents(), spec, this.getBudgetMB());
    if (!plan.fits) {
      logger.log(`[ModelResidency] ${spec.key} (${spec.sizeMB}MB) does not fit budget ${this.getBudgetMB()}MB even after eviction`);
    }
    for (const victim of plan.evict) {
      const reg = this.residents.get(victim.key);
      if (!reg) continue;
      logger.log(`[ModelResidency] evicting ${victim.key} (${victim.sizeMB}MB, ${victim.type})`);
      await reg.unload().catch(err => logger.log(`[ModelResidency] unload ${victim.key} failed:`, err));
      this.residents.delete(victim.key);
    }
    return { evicted: plan.evict.map(e => e.key), fits: plan.fits };
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
  }
}

export const modelResidencyManager = new ModelResidencyManager();
export type { Resident, ResidentType } from './policy';
