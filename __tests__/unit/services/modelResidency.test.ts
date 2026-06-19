/**
 * Model residency policy + manager tests.
 *
 * The memory-budget / eviction core of model routing: generation models are
 * mutually exclusive, pinned models are never evicted, and LRU eviction frees
 * room for an incoming model. See docs/design/MODEL_ROUTING.md.
 */
import { planEviction, computeBudgetMB, Resident } from '../../../src/services/modelResidency/policy';
import { modelResidencyManager } from '../../../src/services/modelResidency';

const R = (key: string, type: any, sizeMB: number, lastUsedAt: number, pinned = false): Resident =>
  ({ key, type, sizeMB, lastUsedAt, pinned });

describe('computeBudgetMB', () => {
  it('takes the smaller of fraction-of-RAM and RAM-minus-reserve', () => {
    // 8GB: 0.6*8192=4915 vs 8192-1500=6692 → 4915
    expect(Math.round(computeBudgetMB(8192))).toBe(4915);
    // 3GB: 0.6*3072=1843 vs 3072-1500=1572 → 1572 (reserve dominates on low RAM)
    expect(Math.round(computeBudgetMB(3072))).toBe(1572);
  });

  it('never returns negative', () => {
    expect(computeBudgetMB(1000)).toBe(0);
  });
});

describe('planEviction', () => {
  it('lets a text + image model co-reside when the budget fits both', () => {
    const current = [R('img', 'image', 400, 1)];
    const plan = planEviction(current, { key: 'txt', type: 'text', sizeMB: 800 }, 4000);
    expect(plan.evict).toEqual([]); // 400 + 800 <= 4000, both stay
    expect(plan.fits).toBe(true);
  });

  it('evicts the other generation model only when the budget is too tight for both', () => {
    const current = [R('img', 'image', 400, 1)];
    const plan = planEviction(current, { key: 'txt', type: 'text', sizeMB: 800 }, 1000);
    expect(plan.evict.map(e => e.key)).toEqual(['img']); // 400 + 800 > 1000 → evict
    expect(plan.fits).toBe(true);
  });

  it('never evicts a pinned resident (e.g. the classifier)', () => {
    const current = [R('classifier', 'classifier', 100, 1, true), R('whisper', 'whisper', 150, 2)];
    // Tight budget that would otherwise force evicting everything.
    const plan = planEviction(current, { key: 'txt', type: 'text', sizeMB: 800 }, 900);
    expect(plan.evict.map(e => e.key)).toEqual(['whisper']);
    expect(plan.evict.some(e => e.key === 'classifier')).toBe(false);
  });

  it('evicts least-recently-used first until the incoming model fits', () => {
    const current = [
      R('whisper', 'whisper', 150, 30), // newest
      R('tts', 'tts', 120, 10),         // oldest → evicted first
    ];
    const plan = planEviction(current, { key: 'txt', type: 'text', sizeMB: 800 }, 900);
    // budget 900: need to free until used+800 <= 900 → used must be <=100.
    // start used=270; evict tts(oldest)->150; still >100; evict whisper->0; fits.
    expect(plan.evict.map(e => e.key)).toEqual(['tts', 'whisper']);
    expect(plan.fits).toBe(true);
  });

  it('charges no cost for a model that is already resident', () => {
    const current = [R('txt', 'text', 800, 1)];
    const plan = planEviction(current, { key: 'txt', type: 'text', sizeMB: 800 }, 900);
    expect(plan.evict).toEqual([]);
    expect(plan.fits).toBe(true);
  });

  it('reports fits=false when even full eviction is not enough', () => {
    const current = [R('classifier', 'classifier', 100, 1, true)];
    const plan = planEviction(current, { key: 'huge', type: 'text', sizeMB: 5000 }, 1000);
    expect(plan.fits).toBe(false);
  });
});

describe('ModelResidencyManager', () => {
  beforeEach(() => {
    modelResidencyManager._reset();
    modelResidencyManager.setBudgetOverrideMB(1000);
  });

  it('loads a model and tracks it as resident', async () => {
    const load = jest.fn(async () => {});
    const res = await modelResidencyManager.ensureResident({ key: 'txt', type: 'text', sizeMB: 800 }, { load: load, unload: async () => {} }, 1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(res.loaded).toBe(true);
    expect(modelResidencyManager.isResident('txt')).toBe(true);
  });

  it('does not reload an already-resident model', async () => {
    const load = jest.fn(async () => {});
    await modelResidencyManager.ensureResident({ key: 'txt', type: 'text', sizeMB: 800 }, { load: load, unload: async () => {} }, 1);
    const res = await modelResidencyManager.ensureResident({ key: 'txt', type: 'text', sizeMB: 800 }, { load: load, unload: async () => {} }, 2);
    expect(load).toHaveBeenCalledTimes(1);
    expect(res.loaded).toBe(false);
  });

  it('evicts (and unloads) the previous generation model when switching text→image', async () => {
    const unloadText = jest.fn(async () => {});
    await modelResidencyManager.ensureResident({ key: 'txt', type: 'text', sizeMB: 800 }, { load: async () => {}, unload: unloadText }, 1);
    const res = await modelResidencyManager.ensureResident({ key: 'img', type: 'image', sizeMB: 400 }, { load: async () => {}, unload: async () => {} }, 2);
    expect(unloadText).toHaveBeenCalledTimes(1);
    expect(res.evicted).toContain('txt');
    expect(modelResidencyManager.isResident('txt')).toBe(false);
    expect(modelResidencyManager.isResident('img')).toBe(true);
  });

  it('keeps a pinned classifier resident across a generation-model swap', async () => {
    const unloadClassifier = jest.fn(async () => {});
    modelResidencyManager.register({ key: 'smol', type: 'classifier', sizeMB: 100, pinned: true }, unloadClassifier, 1);
    await modelResidencyManager.ensureResident({ key: 'txt', type: 'text', sizeMB: 800 }, { load: async () => {}, unload: async () => {} }, 2);
    expect(unloadClassifier).not.toHaveBeenCalled();
    expect(modelResidencyManager.isResident('smol')).toBe(true);
  });
});
