/**
 * RED-FLOW (integration) — M11/M16: resend after image-gen does NOT swap out the resident image model.
 *
 * After image generation the image model is dirty-resident. Resending text must reload the text model and
 * the two heavy models are meant to be mutually exclusive (swap, per policy.ts:5-7 + imageGenerationService).
 * Runs the REAL modelResidencyManager over the RAM-sensor stub (deviceMemory harness) with the device
 * repro (12GB, 640MB free). RED: the balanced planner co-resides text (5235) + image (2369) into near-OOM
 * instead of evicting the image — the resident image is never swapped out (evicted === []).
 */
import { modelResidencyManager } from '../../../src/services/modelResidency';
import { setDeviceMemory, resetDeviceMemory, makeResident, gbOf } from '../../harness/deviceMemory';

afterEach(() => resetDeviceMemory());

describe('M11 — resend after image-gen refused (red-flow)', () => {
  it('reloads the text model by evicting the resident image model (post-eviction budget)', async () => {
    setDeviceMemory({ platform: 'android', totalGB: 12, availGB: gbOf(640) });
    // Image gen just ran → the image model is dirty-resident.
    makeResident({ key: 'image', type: 'image', modelId: 'sd', sizeMB: 2369, dirtyMemory: true });

    // User resends a text turn → the clean text model must reload.
    const { fits, evicted } = await modelResidencyManager.makeRoomFor({
      key: 'text', type: 'text', modelId: 'gemma', sizeMB: 5235, dirtyMemory: false,
    });

    // Correct: the two heavy models are mutually exclusive — reloading text evicts the resident image,
    // and the clean text model fits. Today the balanced planner co-resides both (evicted === []),
    // stacking to near-OOM → RED.
    expect(fits).toBe(true);
    expect(evicted).toContain('image');
  });
});
