import { useHasRegisteredScreen } from '../navigation/screenRegistry';
import { selectHasProAccess } from '../stores/proAccessSlice';
import { useAppStore } from '../stores';

/**
 * Single reactive source of truth for "are Pro features currently active in the
 * UI right now?".
 *
 * Pro features are activated by loadProFeatures(), which calls pro.activate() and
 * registers the Pro Tools destination screen ('McpServers'). This is true for
 * both a verified purchase AND the DEV unlock path (__DEV__ && !devProDisabled) —
 * unlike appStore.hasRegisteredPro, which only flips true after license
 * verification and therefore misses dev/simulator builds.
 *
 * Gating UI on the registered screen mirrors the existing handleMcpPress check in
 * ChatMessageArea, so the whole app agrees on one definition of "Pro is active".
 */
export const PRO_TOOLS_SCREEN = 'McpServers';

export function useIsProActive(): boolean {
  const registered = useHasRegisteredScreen(PRO_TOOLS_SCREEN);
  // Registration says the bundle LOADED; access says this device is still entitled to it. Both, because
  // registries cannot be unregistered: a device the roster deactivated while the app was running has the
  // Pro screens registered for the rest of the session, and would keep every Pro entry point without this.
  const hasAccess = useAppStore(selectHasProAccess);
  return registered && hasAccess;
}
