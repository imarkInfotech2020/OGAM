/**
 * Flow 1 - pair by code, in one direction.
 *
 * The journey a person actually does: one device shows a code, the other enters it, and BOTH then say
 * they are connected. Direction matters, so this is a route (host shows, joiner enters) rather than a
 * pair, and the suite runs it both ways round for every pair in the mesh.
 *
 * The flow starts by making the joiner forget the host, and that is the point rather than a shortcut:
 * `pair()` returns `alreadyConnected` on a live link, so running this against a connected mesh would
 * report six passes without a single code ever being typed. A flow that cannot fail is not a test.
 *
 * It tears down only what it owns - one credential, on one side - and the pairing it performs is what
 * restores it. Nothing else in the mesh is touched.
 */
import { forget, pair } from '../sync-surface.mjs';

export const flow = {
  name: 'pair-by-code',
  title: 'Pair by code, each direction',
  /** Every pair in the mesh, both ways round. host shows the code; joiner enters it. */
  routes: [
    { host: 'ios', joiner: 'android' },
    { host: 'android', joiner: 'ios' },
    { host: 'macos', joiner: 'android' },
    { host: 'android', joiner: 'macos' },
    { host: 'windows', joiner: 'ios' },
    { host: 'ios', joiner: 'windows' },
    { host: 'macos', joiner: 'ios' },
    { host: 'ios', joiner: 'macos' },
    { host: 'windows', joiner: 'android' },
    { host: 'android', joiner: 'windows' },
    { host: 'macos', joiner: 'windows' },
    { host: 'windows', joiner: 'macos' },
  ],

  /**
   * @param {object} step - the surfaces and names for this route, already opened on Devices.
   * @returns {Promise<{detail: string}>}
   */
  async run({ host, joiner, hostName, joinerName, say }) {
    // Read state before acting: a link that is already down needs no tearing down, and forgetting a
    // device the joiner never had is not an error worth failing a route over.
    if (await joiner.isConnectedTo(hostName)) {
      say(`${joiner.platform}: forgetting ${hostName} so the code is really required`);
      await forget(joiner, hostName);
    }

    if (await joiner.isConnectedTo(hostName)) {
      throw new Error(
        `${joiner.platform} still reports ${hostName} as connected after Forget, so this route would ` +
          'pass without ever entering a code',
      );
    }

    say(`${host.platform} shows a code; ${joiner.platform} enters it`);
    const outcome = await pair({ host, joiner, hostName, joinerName });

    if (!outcome.usedCode) {
      throw new Error(
        `${joiner.platform} reconnected to ${hostName} without being asked for a code - the credential ` +
          'survived the Forget, so this is not a pair-by-code',
      );
    }

    return { detail: `${joinerName} -> ${hostName} with code ${outcome.code}` };
  },
};
