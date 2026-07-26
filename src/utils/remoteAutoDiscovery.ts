/**
 * Auto-discovery of remote LLMs (the background LAN scan that finds + auto-adds Ollama / LM Studio /
 * gateway servers) is gated by a Settings toggle. Policy:
 *   - Fresh installs are always OFF — the app must not scan the local network unprompted.
 *   - Existing users who ALREADY configured a gateway keep it ON (a one-time migration), so the
 *     upgrade doesn't silently break a setup they rely on.
 *
 * Both rules are pure functions here so they're unit-testable and have a single source of truth,
 * separate from the React/store I/O that calls them.
 */

/** The toggle's runtime shape (a slice of AppSettings). */
export interface AutoDiscoverSettings {
  autoDiscoverRemoteModels?: boolean;
}

/**
 * Whether the automatic LAN scan may run. It runs ONLY when explicitly enabled — an unset value
 * (fresh install, never migrated) reads as OFF. User-initiated scans (the "Scan Network" button)
 * are NOT gated by this; they're an explicit action.
 */
export function shouldAutoDiscoverRemoteModels(settings: AutoDiscoverSettings): boolean {
  return settings.autoDiscoverRemoteModels === true;
}

/**
 * One-time default resolution for the toggle. Returns the value to persist, or `undefined` when the
 * setting is already decided (already true/false) so the caller writes nothing.
 *   - already set  → undefined (leave the user's / prior migration's choice alone)
 *   - never set + a gateway already exists → true  (grandfather existing setups)
 *   - never set + no gateway               → false (fresh install / no prior remote use → OFF)
 */
export function resolveAutoDiscoverMigration(
  current: boolean | undefined,
  hasExistingGateway: boolean,
): boolean | undefined {
  if (current !== undefined) return undefined;
  return hasExistingGateway;
}
