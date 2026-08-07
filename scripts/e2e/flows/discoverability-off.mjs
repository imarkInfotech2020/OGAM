/**
 * Flow 7 - going hidden stops NEW devices finding you, and leaves the ones you have alone.
 *
 * Two halves, and the second is the one that matters. "Peers stop seeing it" is the obvious half, but
 * it is only observable against a device that is not already paired - a paired peer keeps the link
 * whether or not the advertisement is running, because hiding is about being FOUND, not about being
 * reachable. The card says as much: "Discoverable to new devices".
 *
 * So the assertion here is the guarantee underneath: turning yourself hidden must not cost you the
 * devices you already have. That is the regression worth catching - a reader could easily "fix"
 * discoverability by tearing down the transport, and every existing link would go with it.
 *
 * Restores the setting it found, whatever the outcome. Discoverability is a privacy choice that
 * persists across restarts, so a flow that leaves a device hidden has changed a user's setting rather
 * than tested it - and the next flow would then fail to discover anything, for a reason nowhere in
 * its own output.
 */
import { waitUntil } from '../sync-surface.mjs';

export const flow = {
  name: 'discoverability-off',
  title: 'Hiding a device keeps the devices it already has',
  /** joiner = the device that goes hidden, host = a peer that must keep its link to it. */
  routes: [
    { host: 'macos', joiner: 'android' },
    { host: 'android', joiner: 'ios' },
    { host: 'ios', joiner: 'macos' },
  ],

  async run({ host: peer, joiner: hider, hostName: peerName, joinerName: hiderName, say }) {
    if (!(await peer.isConnectedTo(hiderName))) {
      throw new Error(
        `${peerName} is not connected to ${hiderName} to begin with, so there is no link to protect`,
      );
    }

    const was = await hider.isDiscoverable();
    try {
      say(`${hiderName} goes hidden`);
      await hider.setDiscoverable(false);

      await waitUntil(async () => (await hider.isDiscoverable()) === false, {
        label: `${hiderName} to report itself hidden`,
        timeoutMs: 20_000,
        intervalMs: 1000,
      });
      say(`${hiderName} reports itself hidden - checking it kept its peers`);

      // Long enough for a teardown to show itself. A link that is going to drop because the
      // advertisement stopped drops within the heartbeat window, so a check taken immediately would
      // pass on a build that breaks this.
      const settle = Date.now() + 45_000;
      while (Date.now() < settle) {
        if (!(await peer.isConnectedTo(hiderName))) {
          throw new Error(
            `${peerName} lost its link to ${hiderName} when ${hiderName} went hidden - hiding must ` +
              'stop new devices finding it, not disconnect the ones it already has',
          );
        }
      }

      return { detail: `${hiderName} hidden for 45s, ${peerName} kept the link throughout` };
    } finally {
      // Always. A flow that fails half way through must not leave a device invisible to the mesh.
      await hider.setDiscoverable(was).catch(() => {});
    }
  },
};
