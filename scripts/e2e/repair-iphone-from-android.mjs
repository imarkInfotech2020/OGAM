/**
 * One coordinated flow, end to end: bring the Android and the iPhone into a LIVE session.
 *
 * The two phones are already SAVED to each other, but the Android reports "0 connected" and the
 * iPhone row as "ios - Needs repair". That distinction is the whole point of this flow: a saved row
 * proves a pairing once happened, only "connected" proves the mesh works now. An assertion that
 * accepts the saved row (which is what the existing mesh suite does) passes on a dead mesh.
 *
 * The repair affordance on that row says it reconnects, "asking for its pairing code only if that
 * fails" - so this reads the code off the iPhone and has it ready to type into the Android.
 */
import { connectMesh, readPairingCode } from './mesh.mjs';

const SHOTS =
  '/private/tmp/claude-501/-Users-user-wednesday-off-grid-ai/cc8ce253-368c-4fc5-b1cf-8cab1fe50446/scratchpad';

const interesting = (labels) =>
  labels.filter((l) => /connected|repair|pair|code|offline|enter|cancel|dismiss|retry|failed|error|match/i.test(l));

const show = (who, labels) => console.log(`\n[${who}]\n  ${interesting(labels).join('\n  ')}`);

const toDevices = async (device) => {
  await device.waitForLabel('home-screen', { label: `${device.platform} home`, timeoutMs: 60_000 });
  await device.scrollAndTap('open-sync-from-home', { timeoutMs: 30_000 });
  await device.waitForLabel('sync-this-device', { label: `${device.platform} Devices`, timeoutMs: 40_000 });
};

const mesh = await connectMesh();
const [iphone, android] = [mesh.a, mesh.b];

await mesh.both(toDevices);
console.log('both phones are on the Devices screen');

// The code the iPhone shows for itself. This is what the Android will be asked for.
const iphoneCode = await readPairingCode(iphone);
console.log(`\n>>> the iPhone's pairing code is ${iphoneCode}`);

const before = await android.labels();
show('Android before', before);

// The repair control for the iPhone row, found by id so this does not depend on row order.
const repair = before.find((l) => /^sync-repair-/.test(l));
if (!repair) throw new Error(`no repair control on the Android. Saw: ${interesting(before).join(' | ')}`);
console.log(`\n>>> tapping ${repair} on the Android`);
await android.tapLabel(repair);

// WAIT for the dialog instead of sleeping once and sampling: the reconnect is attempted first, so the
// code prompt arrives well after a few seconds. A single early sample reports "no prompt appeared"
// while the dialog opens a moment later - which is exactly what happened on the previous run.
const asksForCode = await android
  .waitForLabel('sync-pairing-code-input', { label: 'the pairing-code dialog', timeoutMs: 45_000 })
  .then(() => true)
  .catch(() => false);
const opened = await android.labels();
show('Android after tapping repair', opened);
await android.screenshot(`${SHOTS}/repair-01-android.png`);
if (asksForCode) {
  // Re-read the code rather than reuse the one from the top of the run: it rotates, and a stale code
  // would fail as code_mismatch and read exactly like a broken handshake.
  const fresh = await readPairingCode(iphone);
  console.log(`>>> code prompt is up. The iPhone is now showing ${fresh}`);

  // Focus the field FIRST. adb `input text` goes to whatever holds focus, so typing without tapping
  // the box sends the code into nothing - which is why the previous attempt left the dialog unchanged.
  await android.tapLabel('sync-pairing-code-input');
  await new Promise((r) => setTimeout(r, 800));
  await android.type(fresh.replace('-', ''));
  await new Promise((r) => setTimeout(r, 800));
  await android.screenshot(`${SHOTS}/repair-02-android-typed.png`);
  show('Android with the code typed', await android.labels());

  console.log('>>> confirming with "Pair again"');
  await android.tapLabel('sync-pairing-code-confirm');
  await new Promise((r) => setTimeout(r, 3000));
  await android.screenshot(`${SHOTS}/repair-03-android-confirmed.png`);
  show('Android after confirming', await android.labels());
} else {
  console.log('>>> no code prompt appeared; the repair is reconnecting on its own');
}

// The only assertion that matters: a LIVE session, on both sides.
let verdict = 'FAIL';
try {
  await mesh.converge({
    label: 'the Android to report 1 connected and the iPhone to stop needing repair',
    timeoutMs: 120_000,
    onB: async (d) => (await d.labels()).some((l) => /[1-9]\d* connected/.test(l)),
    onA: async (d) => (await d.labels()).some((l) => /[1-9]\d* connected/.test(l)),
  });
  verdict = 'PASS';
} catch (error) {
  console.log(`\n${error.message}`);
}

const [finalIphone, finalAndroid] = await mesh.both((d) => d.labels());
show('iPhone final', finalIphone);
show('Android final', finalAndroid);
await mesh.captureBoth(SHOTS, 'repair-03-final');
console.log(`\n${verdict}  live Android <-> iPhone session`);
console.log(`screenshots in ${SHOTS}`);
