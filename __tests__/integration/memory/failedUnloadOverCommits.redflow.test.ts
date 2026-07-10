/**
 * RED-FLOW (integration) — PR#454 (audit A2): a failed eviction unload must not be counted as freed.
 *
 * makeRoomFor evicts victims via `await reg.unload().catch(log); this.residents.delete(key)` and returns
 * fits from the pre-unload plan (modelResidency/index.ts:386-424). A victim whose native unload REJECTS
 * (still holding RAM) is deleted from the budget map and counted as freed → the caller (which honors
 * `fits`) loads the incoming model on top → OOM. Runs the REAL modelResidencyManager over the RAM-sensor
 * stub; the only faked boundary is the native unload (made to reject).
 */
import { modelResidencyManager } from '../../../src/services/modelResidency';
import { setDeviceMemory, resetDeviceMemory, makeResident, gbOf } from '../../harness/deviceMemory';

afterEach(() => resetDeviceMemory());

describe('PR#454 — failed eviction unload over-commits memory (red-flow)', () => {
  it('keeps the victim resident and reports fits=false when its unload rejects', async () => {
    setDeviceMemory({ platform: 'android', totalGB: 12, availGB: gbOf(640) });
    // A resident that must be evicted to make room — but its native unload will FAIL.
    const unload = makeResident({ key: 'image', type: 'image', modelId: 'sd', sizeMB: 2369, dirtyMemory: true });
    unload.mockRejectedValue(new Error('native unload failed — bridge torn down'));

    const { fits, evicted } = await modelResidencyManager.makeRoomFor({
      key: 'text', type: 'text', modelId: 'gemma', sizeMB: 5235, dirtyMemory: false,
    });

    // Correct: the unload failed, so the RAM was NOT freed — refuse rather than over-commit, and keep
    // the victim resident. Today the victim is deleted + counted as evicted and fits=true → OOM → RED.
    expect(fits).toBe(false);
    expect(evicted).not.toContain('image');
    expect(modelResidencyManager.isResident('image')).toBe(true);
  });
});
