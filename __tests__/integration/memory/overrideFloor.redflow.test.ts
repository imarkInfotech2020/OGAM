/**
 * RED-FLOW (integration) — M4/M5/M6: the Load-Anyway survival floor mis-judges dirty vs clean working
 * sets. Runs the REAL modelResidencyManager over the RAM-sensor stub (deviceMemory harness). These assert
 * the GATE VERDICT (the automatable half); the actual jetsam is device-only (Provit).
 *
 * M4 — a clean GGUF working set is charged NOTHING to the floor → an 8GB model is admitted at 1200MB free.
 * M5 — the flat 1200 floor OVER-refuses a plainly-safe 2GB dirty Load-Anyway at 3.1GB free.
 * M6 — aggressive policy over-commits a single 9GB dirty model at 3GB free (zram/dirty can't back it).
 */
import { modelResidencyManager } from '../../../src/services/modelResidency';
import { setDeviceMemory, resetDeviceMemory, gbOf } from '../../harness/deviceMemory';

afterEach(() => resetDeviceMemory());

describe('memory override floor — red-flow (gate verdict; currently RED)', () => {
  it('M4: Load-Anyway an 8GB clean GGUF at 1200MB free on 12GB iOS is REFUSED (working-set charge)', async () => {
    setDeviceMemory({ platform: 'ios', totalGB: 12, availGB: gbOf(1200) });
    const { fits } = await modelResidencyManager.makeRoomFor(
      { key: 'text', type: 'text', modelId: 'big', sizeMB: 8192, dirtyMemory: false },
      { override: true },
    );
    // Today: admitted — the clean branch charges 0 to the floor, ignoring the dirty inference working set.
    expect(fits).toBe(false);
  });

  it('M5: Load-Anyway a 2GB dirty model at 3.1GB free on 12GB iOS is ALLOWED (flat floor over-refuses)', async () => {
    setDeviceMemory({ platform: 'ios', totalGB: 12, availGB: gbOf(3100) });
    const { fits } = await modelResidencyManager.makeRoomFor(
      { key: 'text', type: 'text', modelId: 'small', sizeMB: 2048, dirtyMemory: true },
      { override: true },
    );
    // Today: refused — the flat 1200 floor demands size+1200 = 3248 > 3100, blocking a plainly-safe load.
    expect(fits).toBe(true);
  });

  it('M6: aggressive policy REFUSES a single 9GB dirty model at 3GB free on 12GB (zram cannot back it)', async () => {
    setDeviceMemory({ platform: 'android', totalGB: 12, availGB: gbOf(3000), policy: 'aggressive' });
    const { fits } = await modelResidencyManager.makeRoomFor(
      { key: 'text', type: 'text', modelId: 'huge', sizeMB: 9216, dirtyMemory: true },
      { override: true },
    );
    // Today: admitted — aggressive (0.88/0.92) over-commits dirty pages that can't be paged out.
    expect(fits).toBe(false);
  });
});
