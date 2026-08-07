/**
 * One coordinated flow: pair the Android with the macOS desktop on .64, and prove a LIVE session.
 *
 * The Mac is targeted by its FINGERPRINT, not by name or row order, for a specific reason: the Windows
 * guest on the same box advertises itself as `macos` too (see the P1 in desktop/docs/GAPS_BACKLOG.md),
 * so "the macOS row" is ambiguous on this LAN and a name match could pair the wrong machine.
 *
 * The Mac is OBSERVED, not driven - macOS refuses synthetic clicks to an ssh session (-25211). Its
 * pairing code therefore has to be read off its screen, which is why the code is passed IN rather than
 * scraped: a screenshot is read by a human (or a vision pass), not by this script.
 *
 *   MAC_PAIRING_CODE=MSAN-YR7J E2E_PLATFORM=android node scripts/e2e/connect-android-to-mac.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connectDevice } from './device.mjs';

const run = promisify(execFile);
const SHOTS =
  '/private/tmp/claude-501/-Users-user-wednesday-off-grid-ai/cc8ce253-368c-4fc5-b1cf-8cab1fe50446/scratchpad';
const HOST = '192.168.1.64';
const LOG = '/Users/admin/Library/Application Support/Off Grid AI Desktop/logs/off-grid-ai-desktop.log';
const MAC_ID = process.env.MAC_SYNC_ID ?? 'd0e933934ac1be2b3ecf50ce0d7fbc85';
const CODE = process.env.MAC_PAIRING_CODE;

if (!CODE) throw new Error('MAC_PAIRING_CODE is required - read it off the Mac\'s Devices screen.');

const mac = async (command) => {
  const { stdout } = await run(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', `admin@${HOST}`, command],
    { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout.trim();
};

const interesting = (labels) =>
  labels.filter((l) => /connected|offline|reconnect|repair|pair|code|failed|error|match|MacOS|Win/i.test(l));

// netstat, not lsof: lsof's COMMAND column truncates "Off Grid AI Desktop", so grepping it finds
// nothing even while the port is plainly bound. That cost a wrong "no mesh listener" read earlier.
const listeners = () =>
  mac('netstat -an -p tcp | grep -i listen | grep -v "127.0.0.1\\|::1\\|\\*\\.22"').catch(() => '');

console.log(`[Mac] wildcard listeners:\n${(await listeners()) || '(none - it cannot be dialed)'}`);

const { device: android, platform } = await connectDevice({ restart: true });
if (platform !== 'android') throw new Error(`expected the Android, got ${platform}`);

await android.waitForLabel('home-screen', { label: 'the Android home screen', timeoutMs: 60_000 });
await android.scrollAndTap('open-sync-from-home', { timeoutMs: 30_000 });
await android.waitForLabel('sync-this-device', { label: 'the Android Devices screen', timeoutMs: 40_000 });

// Rescan, then WAIT for the Mac's id to show up rather than sampling once after a sleep.
await android.tapWhenReady('sync-rescan').catch(() => null);
const found = await android
  .waitFor(async (d) => (await d.labels()).some((l) => l.includes(MAC_ID)), {
    label: `the Mac (${MAC_ID.slice(0, 8)}) to appear on the Android`,
    timeoutMs: 60_000,
    intervalMs: 2000,
  })
  .then(() => true)
  .catch(() => false);

const before = await android.labels();
console.log(`\n[Android before]\n  ${interesting(before).join('\n  ')}`);
if (!found) throw new Error(`the Android never listed ${MAC_ID}. It cannot pair with a device it cannot see.`);

// Whichever control that row offers: a fresh pair, or a repair of a pairing whose secret is gone.
const control =
  before.find((l) => l === `sync-pair-${MAC_ID}`) ??
  before.find((l) => l === `sync-repair-${MAC_ID}`) ??
  before.find((l) => l === `sync-reconnect-${MAC_ID}`);
if (!control) throw new Error(`no pair/repair control for ${MAC_ID}. Saw: ${interesting(before).join(' | ')}`);
console.log(`\n>>> tapping ${control}`);
await android.tapLabel(control);

const asksForCode = await android
  .waitForLabel('sync-pairing-code-input', { label: 'the pairing-code dialog', timeoutMs: 45_000 })
  .then(() => true)
  .catch(() => false);
await android.screenshot(`${SHOTS}/mac-01-android-dialog.png`);

if (asksForCode) {
  console.log(`>>> entering the Mac's code ${CODE}`);
  // Focus first: adb `input text` goes to whatever holds focus, so typing into an unfocused dialog
  // silently does nothing and reads as a failed handshake.
  await android.tapLabel('sync-pairing-code-input');
  await new Promise((r) => setTimeout(r, 800));
  await android.type(CODE.replace('-', ''));
  await new Promise((r) => setTimeout(r, 800));
  await android.screenshot(`${SHOTS}/mac-02-android-typed.png`);
  await android.tapLabel('sync-pairing-code-confirm');
} else {
  console.log('>>> no code prompt - reconnecting on a stored secret');
}

let verdict = 'FAIL';
try {
  await android.waitFor(
    async (d) => {
      const labels = await d.labels();
      // The Mac's OWN row must say connected. "N connected" alone could be the iPhone from the
      // earlier flow, which would make this pass without the Mac ever joining.
      const row = labels.findIndex((l) => l.includes(MAC_ID));
      return row >= 0 && labels.slice(row, row + 6).some((l) => /Connected/i.test(l));
    },
    { label: "the Mac's row on the Android to read Connected", timeoutMs: 120_000, intervalMs: 2000 },
  );
  verdict = 'PASS';
} catch (error) {
  console.log(`\n${error.message}`);
}

const after = await android.labels();
console.log(`\n[Android after]\n  ${interesting(after).join('\n  ')}`);
await android.screenshot(`${SHOTS}/mac-03-android-final.png`);

// The Mac's side, from the Mac itself: an ESTABLISHED session beats a rendered label.
const established = await mac(
  'netstat -an -p tcp | grep -i established | grep -v "127.0.0.1\\|::1"',
).catch(() => '');
console.log(`\n[Mac] established sessions:\n${established || '(none)'}`);
const macLog = await mac(
  `grep -i 'pair\\|peer\\|session' '${LOG}' | grep -v 'pro:sync:status\\|permissions:get-status\\|model:check-status' | tail -10`,
).catch(() => '');
console.log(`\n[Mac] log:\n${macLog || '(nothing)'}`);

console.log(`\n${verdict}  live Android <-> macOS (.64) session`);
