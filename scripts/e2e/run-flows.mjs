/**
 * The suite. One command runs every flow; one command runs one flow.
 *
 *   node scripts/e2e/run-flows.mjs
 *   node scripts/e2e/run-flows.mjs --only pair-by-code
 *   node scripts/e2e/run-flows.mjs --only pair-by-code --route "android -> ios"
 *
 * The runner owns ORDERING and REPORTING and nothing else. It does not know how to pair, what a code
 * looks like, or which devices exist - a flow owns the journey, the surface owns the platform. Adding
 * a flow means adding a file to flows/ and a line to FLOWS; it means no edit here.
 *
 * Strictly sequential on purpose. Two orchestrations at once collide on the same phone - a second adb
 * uiautomator dump fails outright, two WDA sessions fight over the device - and a person watching four
 * screens cannot follow two journeys at once.
 *
 * Nothing is skipped quietly: a route that does not run is printed with the reason. A suite that
 * silently covers half the matrix reads exactly like one that covered all of it.
 */
import { mkdir } from 'node:fs/promises';
import { EVIDENCE_DIR, flag, specFor } from './mesh-config.mjs';
import { connectSurface } from './sync-surface.mjs';
import { flow as pairByCode } from './flows/pair-by-code.mjs';
import { flow as reconnectInRange } from './flows/reconnect-in-range.mjs';

/** Every flow, in the order they are meant to run. */
const FLOWS = [pairByCode, reconnectInRange];

const only = flag('only');
const onlyRoute = flag('route');

const label = (route) => `${route.joiner} -> ${route.host}`;

/** A screenshot filename that says which flow and which route produced it. */
const evidenceName = (flowName, route) =>
  `${EVIDENCE_DIR}/${flowName}--${label(route).replace(/[^a-z0-9]+/gi, '-')}`;

const results = [];
const skipped = [];

await mkdir(EVIDENCE_DIR, { recursive: true });

for (const flow of FLOWS) {
  if (only && flow.name !== only) {
    skipped.push(`flow ${flow.name}: not selected by --only ${only}`);
    continue;
  }
  console.log(`\n=== ${flow.title} ===\n`);

  for (const route of flow.routes) {
    if (onlyRoute && label(route) !== onlyRoute) {
      skipped.push(`${flow.name} ${label(route)}: not selected by --route`);
      continue;
    }

    const started = Date.now();
    let host;
    let joiner;
    try {
      host = await connectSurface(specFor(route.host));
      joiner = await connectSurface(specFor(route.joiner));
      await host.openDevices();
      await joiner.openDevices();
      // Read the names off the devices. Never typed in: a name in a script goes stale the moment
      // somebody renames a device, and flow 20 renames one on purpose.
      const hostName = await host.deviceName();
      const joinerName = await joiner.deviceName();

      const say = (message) => console.log(`      ${message}`);
      const { detail } = await flow.run({ host, joiner, hostName, joinerName, say });

      await joiner.screenshot(`${evidenceName(flow.name, route)}--joiner.png`);
      await host.screenshot(`${evidenceName(flow.name, route)}--host.png`);
      results.push({ flow: flow.name, route: label(route), ok: true, detail, ms: Date.now() - started });
      console.log(`PASS  ${label(route).padEnd(22)} ${detail}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // Evidence matters most when it failed. Best effort - a surface that is already gone must not
      // replace the real reason with a screenshot error.
      await joiner?.screenshot(`${evidenceName(flow.name, route)}--FAILED-joiner.png`).catch(() => {});
      await host?.screenshot(`${evidenceName(flow.name, route)}--FAILED-host.png`).catch(() => {});
      results.push({
        flow: flow.name,
        route: label(route),
        ok: false,
        detail: reason,
        ms: Date.now() - started,
      });
      console.log(`FAIL  ${label(route).padEnd(22)} ${reason.split('\n')[0]}`);
      // STOP on the first failure. Carrying on past a broken link produces a cascade of failures that
      // all describe the same cause, and buries the one that matters.
      if (!flag('keep-going')) {
        console.log('\nStopping at the first failure. Re-run with --keep-going to see the rest.');
        break;
      }
    } finally {
      for (const surface of [host, joiner]) {
        try {
          // Leave no half-finished sheet behind. A flow that aborts between opening a destructive
          // confirmation and pressing it leaves the device sitting on that sheet, where the NEXT
          // flow's first read is answered by the sheet rather than the device list.
          if (await surface?.dismissSheet()) {
            console.log(`      ${surface.platform}: dismissed a confirmation left open by this route`);
          }
        } catch {
          // Best effort: restoring the screen must not overwrite the route's real verdict.
        }
        try {
          await surface?.close();
        } catch {
          // A surface that will not close cleanly must not decide the route's verdict.
        }
      }
    }
  }
}

console.log('\n--- matrix ---');
for (const entry of results) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.flow.padEnd(14)} ${entry.route.padEnd(22)} ${entry.detail}`);
}
for (const note of skipped) console.log(`SKIP  ${note}`);

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed, ${skipped.length} skipped`);
console.log(`evidence in ${EVIDENCE_DIR}`);
process.exit(failed.length ? 1 : 0);
