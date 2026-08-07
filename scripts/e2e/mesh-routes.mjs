/**
 * Every route in the mesh, run in one pass, reported as one line each.
 *
 * A route is a direction: which device shows the code, and which device enters it. Direction matters -
 * the joiner is the side that has to have lost its credential, so A->B and B->A are genuinely different
 * journeys, not the same one twice.
 *
 * Runs in the order the mesh grows in real life:
 *   mobile -> mobile    the pair that needs no desktop at all
 *   mobile -> desktop   a phone joining a computer
 *   desktop -> mobile   a computer joining a phone
 *   desktop -> desktop  the two computers
 *
 * Nothing here knows about pairing. It composes `pair()` from sync-surface, so a route is three lines
 * and a new capability (clipboard, file transfer, receive gates) becomes another verb over the same
 * surfaces rather than another script.
 *
 *   WDA_URL=http://…:8100 node scripts/e2e/mesh-routes.mjs
 *   node scripts/e2e/mesh-routes.mjs --only mobile-to-desktop
 *   node scripts/e2e/mesh-routes.mjs --mac 192.168.1.64 --win 192.168.1.94:9223
 *
 * Every route is independent and non-fatal: a sweep that stops at the first failure hides the other
 * answers, which is the opposite of what it is for.
 */
import { connectSurface, pair } from './sync-surface.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at < 0 ? fallback : argv[at + 1];
};

const MAC = flag('mac', '192.168.1.64');
const WIN = flag('win', '192.168.1.94:9223');
const only = flag('only');

const spec = (kind) => {
  if (kind === 'macos') {
    const [host, port] = MAC.split(':');
    return { kind, host, ...(port ? { port: Number(port) } : {}) };
  }
  if (kind === 'windows') {
    const [host, port] = WIN.split(':');
    return { kind, host, ...(port ? { port: Number(port) } : {}) };
  }
  return { kind };
};

/** host shows the code, joiner enters it. */
const ROUTES = [
  { group: 'mobile-to-mobile', host: 'ios', joiner: 'android' },
  { group: 'mobile-to-desktop', host: 'macos', joiner: 'android' },
  { group: 'mobile-to-desktop', host: 'windows', joiner: 'ios' },
  { group: 'desktop-to-mobile', host: 'ios', joiner: 'macos' },
  { group: 'desktop-to-mobile', host: 'android', joiner: 'windows' },
  { group: 'desktop-to-desktop', host: 'macos', joiner: 'windows' },
];

/**
 * The name a device calls ITSELF, read off its own screen.
 *
 * Never passed in: a name typed into a script goes stale the moment someone renames a device, which
 * happened repeatedly while this was being built.
 */
const nameOf = async (surface) => {
  const text = await surface.text();
  if (surface.family === 'electron') {
    const match = text.match(/This device:\s*(.+)/);
    if (match) return match[1].trim();
    throw new Error(`could not read the device name on ${surface.platform}`);
  }
  const lines = text.split('\n').map((line) => line.trim());
  const at = lines.indexOf('sync-this-device');
  if (at < 0) throw new Error(`no device card on ${surface.platform}`);
  // Nearest usable neighbour in BOTH directions: iOS emits the name just before the marker, Android
  // just after, so a single-direction read is right on one phone and returns a caption on the other.
  const caption = new Set([
    'This device',
    'Discoverable',
    'Not discoverable',
    'Hidden',
    'PERSONAL MESH',
    'Rename this device',
    'Discoverable to new devices',
  ]);
  const usable = (line) =>
    Boolean(line) &&
    !line.startsWith('sync-') &&
    !caption.has(line) &&
    !/^\d+$/.test(line) &&
    !/devices saved|connected|Let new devices/i.test(line);
  for (let step = 1; step <= 3; step += 1) {
    for (const index of [at - step, at + step]) {
      if (index >= 0 && index < lines.length && usable(lines[index])) return lines[index];
    }
  }
  throw new Error(`could not read the device name on ${surface.platform}`);
};

const results = [];

for (const route of ROUTES) {
  if (only && route.group !== only) continue;
  const label = `${route.joiner} -> ${route.host}`;
  const started = Date.now();
  let host;
  let joiner;
  try {
    host = await connectSurface(spec(route.host));
    joiner = await connectSurface(spec(route.joiner));
    await Promise.all([host.openDevices(), joiner.openDevices()]);
    const [hostName, joinerName] = await Promise.all([nameOf(host), nameOf(joiner)]);
    const outcome = await pair({ host, joiner, hostName, joinerName });
    const how = outcome.alreadyConnected
      ? 'already connected'
      : `${outcome.action}${outcome.usedCode ? ` with code ${outcome.code}` : ' (no code needed)'}`;
    results.push({ group: route.group, label, ok: true, detail: `${hostName} <- ${joinerName}: ${how}`, ms: Date.now() - started });
    console.log(`PASS  ${route.group.padEnd(18)} ${label.padEnd(22)} ${how}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    results.push({ group: route.group, label, ok: false, detail: reason, ms: Date.now() - started });
    console.log(`FAIL  ${route.group.padEnd(18)} ${label.padEnd(22)} ${reason.split('\n')[0]}`);
  } finally {
    // Not `.catch()` on the result: one surface's close returns a promise and the other returns
    // undefined, so chaining off it threw inside the cleanup and masked the route's real outcome.
    for (const surface of [host, joiner]) {
      try {
        await surface?.close();
      } catch {
        // A surface that will not close cleanly must not decide the route's verdict.
      }
    }
  }
}

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} routes connected`);
for (const entry of failed) console.log(`  - ${entry.label}: ${entry.detail.split('\n')[0]}`);
process.exit(failed.length ? 1 : 0);
