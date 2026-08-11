#!/usr/bin/env -S node --no-warnings
/**
 * Pull e2e coverage off a device and write it where the merge tooling expects it.
 *
 * Hermes has no V8 coverage API, so the app is instrumented at build time instead (babel.config.js under
 * `E2E_COVERAGE=1`) and accumulates counters in `global.__coverage__`. This script's whole job is getting that
 * object back to the host as Istanbul JSON.
 *
 * Two ways in, tried in this order:
 *
 *   1. THE DEBUGGER. A debug build is attached to Metro, which proxies the Hermes CDP inspector. `Runtime.evaluate`
 *      reads the global directly. Costs nothing and needs no app code, which is why it is first.
 *   2. A FILE the app wrote. Needed when there is no inspector - a release-flavoured e2e build, or a run where
 *      Metro is not in the picture. Requires an in-app dump action; without one this path simply reports that it
 *      found nothing rather than pretending.
 *
 * Output: coverage-e2e/coverage-final.json, in the same Istanbul shape jest and c8 emit, so
 * ../shared/scripts/new-code-coverage.mjs merges it with the unit and integration reports unchanged. Because
 * babel-plugin-istanbul instruments SOURCE, this report is source-accurate - it can contribute denominators, not
 * just covered lines like a report remapped from a bundle.
 *
 *   node scripts/e2e/collect-coverage.mjs                          the debugger, then a file
 *   node scripts/e2e/collect-coverage.mjs --file /sdcard/cov.json   an Android dump, pulled with adb
 *   node scripts/e2e/collect-coverage.mjs --out other/dir           somewhere else
 */
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const argOf = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};

const METRO = argOf('metro', 'http://localhost:8081');
const OUT_DIR = argOf('out', 'coverage-e2e');
const REMOTE_FILE = argOf('file', null);
const ANDROID_SERIAL = argOf('serial', null);
const IOS_UDID = argOf('udid', null);

const log = (...parts) => console.log('[coverage]', ...parts);

/** Ask Metro which Hermes targets are attached. Zero targets means no debug build is connected right now. */
async function inspectorTargets() {
  try {
    const response = await fetch(`${METRO}/json/list`, { signal: AbortSignal.timeout(4000) });
    const targets = await response.json();
    return Array.isArray(targets) ? targets.filter((t) => t.webSocketDebuggerUrl) : [];
  } catch {
    return [];
  }
}

/**
 * Read `global.__coverage__` over CDP.
 *
 * `Runtime.evaluate` with returnByValue would have to serialise a very large object through the protocol's own
 * JSON, which truncates on some builds; stringifying inside the app and returning a string is stable.
 */
async function viaDebugger(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const answer = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the debugger did not answer within 20s')), 20_000);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      const result = message.result?.result;
      if (message.result?.exceptionDetails) {
        reject(new Error(`evaluate threw: ${message.result.exceptionDetails.text}`));
      } else if (typeof result?.value !== 'string') {
        reject(new Error('global.__coverage__ was not a string - is the build instrumented?'));
      } else {
        resolve(result.value);
      }
    });
    socket.addEventListener('error', () => reject(new Error('could not open the debugger socket')));
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: 'JSON.stringify(globalThis.__coverage__ || null)',
        returnByValue: true,
        awaitPromise: false,
      },
    }),
  );
  const raw = await answer;
  socket.close();
  return raw;
}

/** Pull a dump the app wrote. Android goes through adb; iOS through devicectl's app container. */
async function viaFile(remote) {
  const local = path.join(OUT_DIR, 'device-coverage.json');
  if (IOS_UDID) {
    log('pulling', remote, 'from the iPhone…');
    await run('xcrun', [
      'devicectl',
      'device',
      'copy',
      'from',
      '--device',
      IOS_UDID,
      '--source',
      remote,
      '--destination',
      local,
    ]);
  } else {
    log('pulling', remote, 'with adb…');
    const args = ANDROID_SERIAL ? ['-s', ANDROID_SERIAL, 'pull', remote, local] : ['pull', remote, local];
    await run('adb', args);
  }
  const { readFile } = await import('node:fs/promises');
  return readFile(local, 'utf8');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let raw = null;
  const targets = await inspectorTargets();
  if (targets.length > 0) {
    log(`inspector has ${targets.length} target(s); reading __coverage__ from the running app`);
    try {
      raw = await viaDebugger(targets[0]);
    } catch (cause) {
      log('the debugger route failed:', cause.message);
    }
  } else {
    log('no Hermes target attached to Metro');
  }

  if (!raw && REMOTE_FILE) raw = await viaFile(REMOTE_FILE);

  if (!raw || raw === 'null') {
    console.error(
      '\nNo coverage was found. Either:\n' +
        `  - the app was not built with instrumentation (E2E_COVERAGE=1 npx react-native run-ios), or\n` +
        '  - no debug build is attached to Metro and no --file dump was given.\n' +
        'Nothing was written, rather than an empty report that would read as 0% coverage.',
    );
    process.exit(1);
  }

  const coverage = JSON.parse(raw);
  const files = Object.keys(coverage).length;
  if (files === 0) {
    console.error('The app reported an EMPTY coverage object - instrumented, but nothing ran.');
    process.exit(1);
  }

  const out = path.join(OUT_DIR, 'coverage-final.json');
  await writeFile(out, JSON.stringify(coverage));
  log(`wrote ${out} - ${files} file(s)`);
  log('merge it with:');
  log(`  node ../shared/scripts/new-code-coverage.mjs . coverage/coverage-final.json ${out}`);
}

await main();
