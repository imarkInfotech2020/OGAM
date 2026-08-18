import { useSyncExternalStore } from 'react';
import { getToolExtensions } from './extensions';

/**
 * The live sum of every extension's enabled-tool count.
 *
 * `useSyncExternalStore` rather than a render-time reduce, because the counts live in PRO stores this
 * core module must not import (DIP - the same reason extensions exist at all). Reading them
 * imperatively is what made the "Pro Tools" badge stale: deactivate an MCP server and the mounted
 * chat kept the count from its last render, while a fresh chat showed the truth. Each extension that
 * can change publishes a `subscribe`; this re-reads on any of their notifications.
 */
export function useExtensionToolCount(): number {
  return useSyncExternalStore(
    onChange => {
      const stops = getToolExtensions()
        .map(extension => extension.subscribe?.(onChange))
        .filter((stop): stop is () => void => typeof stop === 'function');
      return () => stops.forEach(stop => stop());
    },
    () => getToolExtensions().reduce((n, e) => n + e.enabledToolCount(), 0),
  );
}
