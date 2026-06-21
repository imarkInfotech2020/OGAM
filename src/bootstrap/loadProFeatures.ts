import { registerToolExtension } from '../services/tools/extensions';
import { registerScreen } from '../navigation/screenRegistry';
import { registerSettingsSection } from '../components/settings/sectionRegistry';
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

  // The boot path already read the entitlement in checkProStatus(); reuse it to
  // avoid a second keychain round-trip. Fall back to a read for standalone callers.
  const active = isPro ?? (await readProFromKeychain());
  if (!active) {
    return; // paid features stay dormant until the user purchases
  }

  pro.activate({ registerToolExtension, registerScreen, registerSettingsSection });

  // Inject native OAuth adapters so MCP servers can use OAuth (browser sign-in +
  // Keychain token storage + PKCE crypto). Required before any OAuth connect;
  // until this runs the OAuth option stays hidden in the UI. Loaded lazily so
  // free builds never pull in the native crypto/browser libs.
  if (typeof pro.configureOAuthAdapters === 'function') {
    try {
      const { mcpOAuthNativeAdapters } = require('../services/mcpOAuthNativeAdapters');
      pro.configureOAuthAdapters(mcpOAuthNativeAdapters);
    } catch (err) {
      // Non-fatal: header/none MCP auth still works; OAuth simply stays unavailable.
      console.warn('[pro] MCP OAuth adapters not configured:', err);
    }
  }
}
