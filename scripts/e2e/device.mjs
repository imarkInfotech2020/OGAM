/**
 * One entry point that hands a test whichever device is in front of it.
 *
 * A test written against this gets the same methods on either platform - findByLabel, waitFor, tapWhenReady,
 * screenshot - because scripts/ios/wda-client.mjs and scripts/android/adb-client.mjs deliberately share a
 * surface. That is the whole point: an e2e journey describes what a person does, and "tap the thing labelled
 * Devices" is the same sentence on an iPhone and on a Pixel.
 *
 *   E2E_PLATFORM=ios  WDA_URL=http://…:8100   node --test __tests__/device/*.e2e.mjs
 *   E2E_PLATFORM=android                      node --test __tests__/device/*.e2e.mjs
 *
 * When E2E_PLATFORM is unset it picks whatever is available: a reachable WDA server, otherwise an attached
 * Android device. It throws with instructions rather than skipping, because a device suite that silently passes
 * with no device is worse than one that fails.
 */
import { AdbClient } from '../android/adb-client.mjs';
import { WdaClient } from '../ios/wda-client.mjs';

export const IOS_BUNDLE_ID = process.env.E2E_IOS_BUNDLE ?? 'ai.offgridmobile.dev';
export const ANDROID_PACKAGE = process.env.E2E_ANDROID_PACKAGE ?? 'ai.offgridmobile.dev';

/**
 * The device to drive, already launched into the app.
 *
 * Returns { device, platform, appId }. `device` is a WdaClient or an AdbClient; nothing above this line should
 * need to know which.
 */
export async function connectDevice({ launch = true, restart = false } = {}) {
  const asked = process.env.E2E_PLATFORM;

  if (asked !== 'android') {
    const wdaUrl = process.env.WDA_URL;
    if (wdaUrl) {
      const device = new WdaClient(wdaUrl);
      if (await device.isReady()) {
        if (restart) await device.restart(IOS_BUNDLE_ID);
        else if (launch) await device.session(IOS_BUNDLE_ID);
        return { device, platform: 'ios', appId: IOS_BUNDLE_ID };
      }
      if (asked === 'ios') {
        throw new Error(
          `WDA at ${wdaUrl} is not answering. Start it with: node scripts/ios/launch-wda.mjs ` +
            '(keep that process running, and keep the phone unlocked).',
        );
      }
    } else if (asked === 'ios') {
      throw new Error('E2E_PLATFORM=ios needs WDA_URL, printed by scripts/ios/launch-wda.mjs.');
    }
  }

  if (asked !== 'ios') {
    const device = new AdbClient(process.env.E2E_ANDROID_SERIAL);
    if (await device.isReady()) {
      if (restart) await device.restart(ANDROID_PACKAGE);
      else if (launch) await device.session(ANDROID_PACKAGE);
      return { device, platform: 'android', appId: ANDROID_PACKAGE };
    }
    if (asked === 'android') {
      throw new Error(
        'No Android device is answering adb. Attach one, accept the USB-debugging prompt, and check ' +
          '`adb devices`.',
      );
    }
  }

  throw new Error(
    'No device available. For iOS: node scripts/ios/launch-wda.mjs, then export WDA_URL=<printed url>. ' +
      'For Android: attach a device and check `adb devices`. Set E2E_PLATFORM to require one specifically.',
  );
}

/** Where a run puts its screenshots. Each test names its own files under here. */
export const SHOTS_DIR = process.env.E2E_SHOTS_DIR ?? '__tests__/device/screenshots';
