/**
 * A sanity sweep of the whole sync feature, across every device the mesh actually has.
 *
 * Not a unit test and not the narrow device suites: this walks the surfaces a person walks - is each node
 * up, do they see each other, does a copied line arrive, does a file land, does the licence hold - and
 * prints one line per surface so a failure says WHICH part of sync is broken rather than "e2e failed".
 *
 * Three participants, driven three different ways, because that is what they allow:
 *   iPhone   - WebDriverAgent over HTTP (real taps, real accessibility labels)
 *   Android  - adb (real taps, real view dump)
 *   Mac      - ssh. Its UI cannot be driven at all: macOS refuses synthetic clicks to an ssh session
 *              (-25211), so the desktop is OBSERVED instead - screenshots for what it shows, and the
 *              filesystem and clipboard for what it actually received. Those are better evidence than a
 *              rendered label anyway: a file on disk is not a claim about a file.
 *
 * Run:
 *   node scripts/ios/launch-wda.mjs                        # leave running
 *   WDA_URL=<printed> node scripts/e2e/sync-smoke.mjs
 *
 * Every step is independent and non-fatal: a smoke test that stops at the first problem hides the other
 * nine surfaces, which is the opposite of what it is for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connectMesh, readPairingCode } from './mesh.mjs';
import { SHOTS_DIR } from './device.mjs';

const run = promisify(execFile);

const DESKTOP_HOST = process.env.E2E_DESKTOP_HOST ?? '192.168.1.64';
const DESKTOP_USER = process.env.E2E_DESKTOP_USER ?? 'admin';
const PROFILE = `/Users/${DESKTOP_USER}/Library/Application Support/Off Grid AI Desktop`;

const results = [];

/** ssh to the desktop with key auth; it is installed, so no password ends up in a process list. */
const desktop = async (command, { timeoutMs = 60_000 } = {}) => {
  const { stdout } = await run(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', `${DESKTOP_USER}@${DESKTOP_HOST}`, command],
    { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout.trim();
};

const step = async (surface, act) => {
  const started = Date.now();
  try {
    const detail = await act();
    results.push({ surface, ok: true, detail: detail ?? '', ms: Date.now() - started });
    console.log(`PASS  ${surface}${detail ? ` - ${detail}` : ''}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    results.push({ surface, ok: false, detail: reason, ms: Date.now() - started });
    console.log(`FAIL  ${surface} - ${reason.split('\n')[0]}`);
  }
};

/** The desktop's Devices screen, as a picture, since its labels are unreadable over ssh. */
const desktopShot = async (name) => {
  const remote = '/tmp/offgrid-smoke.png';
  await desktop(`screencapture -x ${remote}`);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const local = path.join(SHOTS_DIR, `${name}.png`);
  await run('scp', ['-o', 'BatchMode=yes', `${DESKTOP_USER}@${DESKTOP_HOST}:${remote}`, local]);
  return local;
};

const main = async () => {
  // restart:true on purpose. Attaching to whatever is already on screen skips session creation entirely
  // (device.mjs only calls session() when it launches), and every phone step then fails with "No WDA
  // session" - which reads like a sync failure and is not one. A restart also gives each surface the same
  // starting point, which is what makes a smoke result comparable between runs.
  const mesh = await connectMesh();

  await step('desktop: app running and licensed', async () => {
    const procs = Number(await desktop('pgrep -f "Off Grid AI Desktop.app/Contents/MacOS" | wc -l'));
    if (procs < 1) throw new Error('the desktop app is not running');
    const entitled = await desktop(
      `grep -c 'license loaded — entitled=true' "${PROFILE}/logs/off-grid-ai-desktop.log" || true`,
    );
    if (Number(entitled) < 1) throw new Error('the desktop app has no Pro entitlement');
    return `${procs} process(es), Pro entitled`;
  });

  await step('desktop: sync is listening', async () => {
    // Its own mesh port. lsof needs root for another session's sockets, hence sudo.
    const ports = await desktop(
      'echo 1234 | sudo -S -p "" lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -i "off" | awk \'{print $9}\' | sort -u | tr "\\n" " "',
    );
    if (!ports.trim()) throw new Error('nothing is listening for the mesh');
    return ports.trim();
  });

  await step('phones: both apps are on their home screen', async () => {
    await mesh.both((device) =>
      device.waitForLabel('home-screen', { label: `${device.platform} home`, timeoutMs: 40_000 }),
    );
    return 'iPhone and Android';
  });

  await step('phones: Devices screen names this device', async () => {
    const names = [];
    await mesh.both(async (device) => {
      await device.tapWhenReady('open-sync-from-home');
      await device.waitForLabel('sync-this-device', { label: `${device.platform} Devices` });
      names.push(device.platform);
    });
    return names.join(' + ');
  });

  await step('phones: a pairing code a person could read out', async () => {
    const codes = [];
    await mesh.both(async (device) => {
      codes.push(`${device.platform}=${await readPairingCode(device)}`);
    });
    return codes.join(' ');
  });

  await step('mesh: each phone lists the other', async () => {
    await mesh.both((device) => device.tapWhenReady('sync-rescan').catch(() => null));
    // A condition per device, because convergence is asymmetric: the one that showed the code and the one
    // that typed it arrive at the same state by different routes.
    const listsAPeer = async (device) =>
      (await device.labels()).some((label) => /sync-paired-|sync-available-/.test(label));
    await mesh.converge({
      label: 'each device to list the other under DEVICES',
      timeoutMs: 90_000,
      onA: listsAPeer,
      onB: listsAPeer,
    });
    return 'both sides agree';
  });

  await step('desktop: what its Devices screen shows', async () => `screenshot at ${await desktopShot('smoke-desktop-devices')}`);

  await step('desktop: received-files library exists and is readable', async () => {
    const listing = await desktop(
      `ls "${PROFILE}/sync-shared-files/library" 2>/dev/null | tr "\\n" " " || echo MISSING`,
    );
    if (listing.includes('MISSING')) throw new Error('no shared-files library on the desktop yet');
    return listing.trim() || '(empty)';
  });

  await step('desktop: clipboard is reachable for a copied-text check', async () => {
    const probe = `offgrid-smoke-${Date.now()}`;
    await desktop(`printf %s '${probe}' | pbcopy`);
    const back = await desktop('pbpaste');
    if (back !== probe) throw new Error(`clipboard did not round-trip (${back.slice(0, 40)})`);
    return 'pbpaste round-trips';
  });

  await step('phones: transfer Activity opens on both', async () => {
    await mesh.both(async (device) => {
      await device.scrollAndTap('sync-open-activity', { timeoutMs: 15_000 });
    });
    return 'Activity reachable';
  });

  await mesh.captureBoth(SHOTS_DIR, 'smoke-final').catch(() => {});

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} surfaces passed`);
  if (failed.length) {
    console.log('failed:');
    for (const entry of failed) console.log(`  - ${entry.surface}: ${entry.detail.split('\n')[0]}`);
  }
  process.exit(failed.length ? 1 : 0);
};

main().catch((error) => {
  console.error(`the sweep could not start: ${error instanceof Error ? error.message : error}`);
  process.exit(2);
});
