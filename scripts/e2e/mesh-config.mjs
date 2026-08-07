/**
 * WHERE the four devices are. One file, because it kept drifting.
 *
 * The Windows tunnel moved from 9223 to 9224 and `mesh-routes.mjs` went on defaulting to 9223, so a
 * sweep reported "no Off Grid page on 192.168.1.94:9223" - a live, healthy app read as a dead one.
 * That is the whole reason this exists: a flow asks for `macos` and gets wherever macOS actually is,
 * and moving a box is a one-line edit here rather than a grep across every flow.
 *
 * Precedence is env over default, and CLI flags over both, so a run can be pointed at another box
 * without editing anything:
 *
 *   node scripts/e2e/run-flows.mjs --mac 192.168.1.64 --win 192.168.1.94:9224
 *   E2E_WIN=192.168.1.94:9224 node scripts/e2e/run-flows.mjs
 *
 * The ports here are the LOCAL end of an ssh tunnel, not the port on the far box. Both desktops bind
 * CDP to their own localhost - deliberately, it is a debugging port - so they are only reachable
 * through the forward. See DEVICES.md for the commands that open them.
 */

/** CLI flags, parsed once. `--mac 192.168.1.64`, `--only pair-by-code`. */
const argv = process.argv.slice(2);

export const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at < 0 ? fallback : argv[at + 1];
};

export const has = (name) => argv.includes(`--${name}`);

/** `host:port` -> `{ host, port }`, with the port optional. */
const endpoint = (value, defaultPort) => {
  const [host, port] = String(value).split(':');
  return { host, port: port ? Number(port) : defaultPort };
};

/**
 * The mesh, as addressed from THIS machine.
 *
 * Kinds are the same four words the surface layer speaks, so a flow that names a device never has to
 * know whether that device is driven over adb, WDA or CDP.
 */
export const MESH = {
  android: () => ({
    kind: 'android',
    serial: flag('android', process.env.E2E_ANDROID_SERIAL ?? '505b53a0'),
  }),
  ios: () => ({
    kind: 'ios',
    wdaUrl: flag('ios', process.env.WDA_URL ?? 'http://127.0.0.1:8100'),
  }),
  macos: () => ({
    kind: 'macos',
    ...endpoint(flag('mac', process.env.E2E_MAC ?? '192.168.1.64:9222'), 9222),
  }),
  windows: () => ({
    kind: 'windows',
    ...endpoint(flag('win', process.env.E2E_WIN ?? '192.168.1.94:9224'), 9224),
  }),
};

export const KINDS = Object.keys(MESH);

/** The connect spec for one device. Throws by name rather than returning undefined into a driver. */
export function specFor(kind) {
  const build = MESH[kind];
  if (!build) throw new Error(`unknown device "${kind}" - the mesh is ${KINDS.join(', ')}`);
  return build();
}

/** Where a flow drops its evidence. One screenshot per flow, named by the flow. */
export const EVIDENCE_DIR = process.env.E2E_EVIDENCE_DIR ?? '.artifacts/e2e-flows';
