/**
 * Two devices at once, with the coordination a sync test needs.
 *
 * Everything interesting about this product happens BETWEEN devices: a code shown on one and typed into the other,
 * a file that leaves here and has to arrive there, a device removed on one Mac that must stop being trusted on the
 * phone. None of that can be asserted on a single device - a one-device test can only prove that a screen renders,
 * which is what the jest suites already do better and faster.
 *
 * So this hands a test two drivers at once and the primitives to sequence them:
 *
 *   const mesh = await connectMesh();
 *   await mesh.both((d) => d.waitForLabel('home-screen'));      // in parallel, both must succeed
 *   const code = await mesh.a.readPairingCode();                 // act on one
 *   await mesh.b.enterPairingCode(code);                         // then the other
 *   await mesh.both((d) => d.waitForLabel('1 connected'));       // converge, with a real timeout
 *
 * The hard part of a two-device test is not the driving, it is the WAITING: an assertion has to allow for the
 * other device being asleep, mDNS taking its time, and a transfer that has not started yet - without turning into
 * a sleep that passes by accident. `converge` is that: poll BOTH devices until each satisfies its own condition,
 * and report which one did not when it times out. "the phone never showed the Mac as connected" is a diagnosis;
 * "timeout" is not.
 */
import { AdbClient } from '../android/adb-client.mjs';
import { WdaClient } from '../ios/wda-client.mjs';
import { ANDROID_PACKAGE, IOS_BUNDLE_ID } from './device.mjs';

/**
 * Both devices, launched into the app.
 *
 * `a` is the iPhone and `b` the Android by default, because that is the pair on this desk; either can be forced
 * with E2E_MESH_A / E2E_MESH_B set to 'ios' or 'android'. Roles rather than platforms is deliberate - a test
 * about pairing should read the same whichever way round the hardware is.
 */
export async function connectMesh({ restart = true } = {}) {
  const wdaUrl = process.env.WDA_URL;
  if (!wdaUrl) {
    throw new Error(
      'A two-device run needs the iPhone as well: node scripts/ios/launch-wda.mjs, then export WDA_URL=<printed>.',
    );
  }

  const ios = new WdaClient(wdaUrl);
  const android = new AdbClient(process.env.E2E_ANDROID_SERIAL);

  const missing = [];
  if (!(await ios.isReady())) missing.push(`the iPhone (WDA at ${wdaUrl} is not answering)`);
  if (!(await android.isReady())) missing.push('the Android device (nothing is answering adb)');
  if (missing.length > 0) {
    throw new Error(`A two-device run needs both devices. Missing: ${missing.join(' and ')}.`);
  }

  // Sequentially, not in parallel: two simultaneous cold starts on one Mac contend for the same USB bus and the
  // same Metro, and a slow launch reads as a broken app.
  if (restart) {
    await ios.restart(IOS_BUNDLE_ID);
    await android.restart(ANDROID_PACKAGE);
  }

  const wrap = (device, platform, appId) => Object.assign(device, { platform, appId });
  const a = wrap(ios, 'ios', IOS_BUNDLE_ID);
  const b = wrap(android, 'android', ANDROID_PACKAGE);

  return {
    a,
    b,
    devices: [a, b],

    /** Run the same thing on both, in parallel, and fail naming the device that did not manage it. */
    async both(action) {
      const results = await Promise.allSettled([action(a), action(b)]);
      const failures = results
        .map((result, index) => ({ result, device: index === 0 ? 'the iPhone' : 'the Android device' }))
        .filter(({ result }) => result.status === 'rejected')
        .map(({ result, device }) => `${device}: ${result.reason?.message ?? result.reason}`);
      if (failures.length > 0) throw new Error(failures.join(' | '));
      return results.map((result) => result.value);
    },

    /**
     * Poll both devices until each satisfies its own condition.
     *
     * The point of a separate condition per device: convergence is rarely symmetric. After pairing, one device
     * shows "1 connected" and the other shows the first device's NAME; after a transfer, the sender says Sent and
     * the receiver says Received. Asserting the same string on both would be wrong in most cases worth testing.
     */
    async converge({ onA, onB, label = 'both devices to agree', timeoutMs = 60_000, intervalMs = 1000 }) {
      const deadline = Date.now() + timeoutMs;
      let lastA;
      let lastB;
      for (;;) {
        const [okA, okB] = await Promise.all([
          onA ? Promise.resolve(onA(a)).catch((cause) => ((lastA = cause), false)) : true,
          onB ? Promise.resolve(onB(b)).catch((cause) => ((lastB = cause), false)) : true,
        ]);
        if (okA && okB) return true;
        if (Date.now() >= deadline) {
          const outstanding = [
            okA ? null : `the iPhone did not get there${lastA ? ` (${lastA.message})` : ''}`,
            okB ? null : `the Android device did not get there${lastB ? ` (${lastB.message})` : ''}`,
          ].filter(Boolean);
          throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}. ${outstanding.join('; ')}`);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    },

    /** A screenshot of both at the same moment - the record of a two-device state. */
    async captureBoth(dir, name) {
      const { mkdir } = await import('node:fs/promises');
      const path = await import('node:path');
      await mkdir(dir, { recursive: true });
      await Promise.all(
        [a, b].map((device) => device.screenshot(path.join(dir, `${name}-${device.platform}.png`))),
      );
    },
  };
}

/**
 * The pairing code shown on a device, read off its own screen.
 *
 * By testID, then a format check, because an empty code section is a real failure and returning '' from here would
 * turn it into a confusing pairing failure three steps later.
 */
export async function readPairingCode(device, { timeoutMs = 20_000 } = {}) {
  await device.waitForLabel('sync-pairing-code-value', { label: 'the pairing-code section', timeoutMs });
  const labels = await device.labels();
  const code = labels.map((l) => l.trim()).find((l) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(l));
  if (!code) {
    throw new Error(
      `The pairing-code section is on screen but shows no code. Saw: ${labels.slice(0, 30).join(' | ')}`,
    );
  }
  return code;
}
