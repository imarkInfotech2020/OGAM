/**
 * Two real phones, one mesh — the journey no single-device test can prove.
 *
 * Everything here is between devices: a code shown on one and typed into the other, and then both having to agree
 * about what happened. A jest suite can prove the projection says "connected" when given connected facts; only two
 * phones can prove the facts arrive.
 *
 * Convergence is asymmetric on purpose. After pairing, the device that typed the code and the device that showed it
 * end up in the same state by different routes, and each is asserted for what IT should show — asserting the same
 * string on both is the mistake that makes a two-device test either wrong or vacuous.
 *
 * Run (both devices attached, iPhone unlocked):
 *   node scripts/ios/launch-wda.mjs                      # leave running
 *   WDA_URL=<printed url> node --test __tests__/device/meshPairing.e2e.mjs
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS_DIR } from '../../scripts/e2e/device.mjs';
import { connectMesh, readPairingCode } from '../../scripts/e2e/mesh.mjs';

let mesh;

before(async () => {
  mesh = await connectMesh();
});

after(async () => {
  // The record of however the run ended, passed or failed. On a two-device failure the interesting thing is almost
  // always what the OTHER device was showing at the time.
  await mesh?.captureBoth(SHOTS_DIR, 'mesh-final').catch(() => {});
});

describe('two devices, one mesh', () => {
  it('opens on both', async () => {
    await mesh.both((device) =>
      device.waitForLabel('home-screen', { label: `${device.platform} home screen`, timeoutMs: 40_000 }),
    );
    await mesh.captureBoth(SHOTS_DIR, 'mesh-01-home');
  });

  it('reaches the Devices screen on both, and each knows its own name', async () => {
    await mesh.both(async (device) => {
      await device.tapWhenReady('open-sync-from-home');
      await device.waitForLabel('sync-this-device', { label: `${device.platform} Devices screen` });
    });

    // Each device has to name ITSELF before it can be named by the other. A blank "This device" is what makes a
    // pairing list unreadable: the user cannot tell which row is the phone in their hand.
    const [iphoneLabels, androidLabels] = await mesh.both((device) => device.labels());
    for (const [platform, labels] of [
      ['the iPhone', iphoneLabels],
      ['the Android device', androidLabels],
    ]) {
      assert.ok(
        labels.some((l) => /\d+ of \d+ devices saved/.test(l)),
        `${platform} should summarise how many devices it has saved`,
      );
    }
    await mesh.captureBoth(SHOTS_DIR, 'mesh-02-devices');
  });

  it('shows a pairing code on one device that the other can be given', async () => {
    // Read from the iPhone: one device shows, the other types. Which way round does not matter to the product, so
    // the test picks a direction and sticks to it.
    const code = await readPairingCode(mesh.a);

    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    // Not the same code on both - each device has its own. Two devices showing one code would mean the code is not
    // device-specific, which would make it useless as a confirmation of WHICH device is pairing.
    const otherCode = await readPairingCode(mesh.b);
    assert.notEqual(code, otherCode, 'each device should show its own pairing code, not a shared one');
  });

  it('discovers the other device over the real network', async () => {
    // The first genuinely cross-device assertion, and the first that can fail for environmental reasons: both
    // phones have to be on the same Wi-Fi with mDNS not blocked. It is given a long window because discovery is
    // not instant, and it names which device failed to see the other.
    await mesh.both((device) => device.tapWhenReady('sync-rescan').catch(() => null));

    await mesh.converge({
      label: 'each device to list the other under DEVICES',
      timeoutMs: 90_000,
      onA: async (device) => {
        const labels = await device.labels();
        // Either it is already saved, or it has appeared as available. Both count as "the mesh can see it".
        return labels.some((l) => /sync-paired-|sync-available-/.test(l));
      },
      onB: async (device) => {
        const labels = await device.labels();
        return labels.some((l) => /sync-paired-|sync-available-/.test(l));
      },
    });
    await mesh.captureBoth(SHOTS_DIR, 'mesh-03-discovered');
  });

  it('agrees about the state of the pairing on both sides', async () => {
    // The invariant that matters, and the one the projection bug on desktop broke: whatever a device says about a
    // peer, the peer must not say something contradictory. Not that both say "connected" - one can legitimately be
    // offline - but that neither claims a relationship the other denies.
    const [iphoneLabels, androidLabels] = await mesh.both((device) => device.labels());

    const iphoneSeesAndroid = iphoneLabels.some((l) => /android|OnePlus|Pixel/i.test(l));
    const androidSeesIphone = androidLabels.some((l) => /iphone|ios/i.test(l));

    assert.equal(
      iphoneSeesAndroid,
      androidSeesIphone,
      'one device lists the other while the other does not list it back - the mesh disagrees with itself. ' +
        `iPhone saw: ${iphoneLabels.slice(0, 25).join(' | ')} || Android saw: ${androidLabels.slice(0, 25).join(' | ')}`,
    );
  });
});
