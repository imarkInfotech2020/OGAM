/**
 * Flow 2 - a saved device drops off the network, comes back, and reconnects BY ITSELF.
 *
 * The promise being tested is the one a person actually feels: you walk out of range, you come back,
 * and your devices are talking again without you opening an app or pressing anything. Every other
 * pairing flow is about a journey the user drives; this one is only meaningful if the user does
 * NOTHING, so the assertion window has no taps in it at all.
 *
 * This is deliberately not written as "tap Reconnect and see if it works" - that passes on a build
 * where nothing heals itself, which is exactly the state this codebase was in when this flow was
 * written: auto-reconnect ran only when discovery ANNOUNCED a device, so a session that dropped while
 * the peer stayed visible was never retried, and the device sat there until a human pressed the
 * button. A flow that presses the button cannot see that bug.
 *
 * The device that goes away is the `peer`; the device that must heal is the `watcher`. Both are named
 * by kind, so the same journey runs for any pair - and the peer is the one that needs `goOffline`,
 * which is why an iPhone can watch but not (yet) go away.
 */
import { waitUntil } from '../sync-surface.mjs';

export const flow = {
  name: 'reconnect-in-range',
  title: 'A device goes out of range and comes back on its own',
  /** watcher = the device under test, peer = the device that disappears. */
  routes: [
    { host: 'macos', joiner: 'android' },
    { host: 'android', joiner: 'windows' },
    { host: 'windows', joiner: 'android' },
  ],

  async run({ host: watcher, joiner: peer, hostName: watcherName, joinerName: peerName, say }) {
    const OUTAGE_MS = 40_000; // comfortably past the 30s heartbeat timeout
    const HEAL_MS = 90_000; // the backoff tops out at 30s, so three chances to come back

    if (!(await watcher.isConnectedTo(peerName))) {
      throw new Error(
        `${watcherName} is not connected to ${peerName} to begin with, so there is no drop to heal. ` +
          'Run the pairing flow first.',
      );
    }

    say(`${peerName} leaves the network for ${OUTAGE_MS / 1000}s (it will come back by itself)`);
    await peer.goOffline(OUTAGE_MS);

    // The drop has to be OBSERVED, not assumed. If the watcher never noticed, nothing was healed and
    // a later "connected" reading is just the link that was never broken.
    say(`waiting for ${watcherName} to notice`);
    await waitUntil(async () => !(await watcher.isConnectedTo(peerName)), {
      label: `${watcherName} to see ${peerName} drop`,
      timeoutMs: 60_000,
      intervalMs: 5_000,
    });
    say(`${watcherName} has seen the drop - NOTHING is touched from here`);

    // Everything past this point is read-only. No taps, no rescan, no Reconnect: the whole claim is
    // that the device does this by itself, and any interaction would be the harness proving its own
    // ability to press a button.
    const askedAt = Date.now();
    await waitUntil(() => watcher.isConnectedTo(peerName), {
      label: `${watcherName} to reconnect to ${peerName} unattended`,
      timeoutMs: HEAL_MS,
      intervalMs: 5_000,
    });
    const healedInMs = Date.now() - askedAt;

    return {
      detail: `${watcherName} healed its link to ${peerName} unattended in ${Math.round(
        healedInMs / 1000,
      )}s, no taps`,
    };
  },
};
