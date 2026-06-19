import { registerToolExtension } from '../services/tools/extensions';
import { registerScreen } from '../navigation/screenRegistry';
import { registerSettingsSection } from '../components/settings/sectionRegistry';
import { registerSlot } from './slotRegistry';
import { registerHook } from './hookRegistry';
import { readProFromKeychain } from '../services/proLicenseService';

export async function loadProFeatures(isPro?: boolean): Promise<void> {
  let pro: any;
  try {
    pro = require('@offgrid/pro');
  } catch {
    return; // free / contributor build: package not installed
  }
  if (!pro) {
    return; // proStub.js returns null — free build via metro extraNodeModules
  }

  // DEV ONLY: unlock pro features locally (audio mode, MCP) without a RevenueCat
  // purchase so they can be tested on simulators/dev builds. __DEV__ is false in
  // release builds, so this can never unlock pro in production. Set to false to
  // exercise the free-build path in dev.
  const DEV_UNLOCK_PRO = __DEV__;

  // The boot path already read the entitlement in checkProStatus(); reuse it to
  // avoid a second keychain round-trip. Fall back to a read for standalone callers.
  const active = (isPro ?? (await readProFromKeychain())) || DEV_UNLOCK_PRO;
  if (!active) {
    return; // paid features stay dormant until the user purchases
  }

  pro.activate({ registerToolExtension, registerScreen, registerSettingsSection, registerSlot, registerHook });
}
