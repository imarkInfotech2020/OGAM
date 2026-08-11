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
import { flag, specFor } from './mesh-config.mjs';
import { connectSurface, pair } from './sync-surface.mjs';

const only = flag('only');

/** host shows the code, joiner enters it. */
const ROUTES = [
  { group: 'mobile-to-mobile', host: 'ios', joiner: 'android' },
  { group: 'mobile-to-desktop', host: 'macos', joiner: 'android' },
  { group: 'mobile-to-desktop', host: 'windows', joiner: 'ios' },
  { group: 'desktop-to-mobile', host: 'ios', joiner: 'macos' },
  { group: 'desktop-to-mobile', host: 'android', joiner: 'windows' },
  { group: 'desktop-to-desktop', host: 'macos', joiner: 'windows' },
];

const results = [];

for (const route of ROUTES) {
  if (only && route.group !== only) continue;
  const label = `${route.joiner} -> ${route.host}`;
  const started = Date.now();
  let host;
  let joiner;
  try {
    host = await connectSurface(specFor(route.host));
    joiner = await connectSurface(specFor(route.joiner));
    await Promise.all([host.openDevices(), joiner.openDevices()]);
    const [hostName, joinerName] = await Promise.all([host.deviceName(), joiner.deviceName()]);
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
