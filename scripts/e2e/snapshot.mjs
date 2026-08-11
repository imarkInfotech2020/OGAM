/**
 * Photograph the whole mesh at one moment, while a person drives it by hand.
 *
 * This is how a manual journey becomes an automated one. A flow can only assert what it can SEE, and
 * the surest way to learn what a journey looks like on four screens is to watch someone perform it and
 * record every screen at every step. The text dump names the controls that were on offer; the
 * screenshot shows what the person actually saw.
 *
 *   node scripts/e2e/snapshot.mjs 1 "before sending"
 *   node scripts/e2e/snapshot.mjs 2 "picked gemma on the mac"
 *
 * Strictly passive: it launches nothing, navigates nothing and taps nothing. It records whatever is on
 * each screen right now. An earlier version opened the Devices screen "read-only", which on iOS means
 * asking WDA for a session on that bundle - and WDA activates the app, terminating what it was doing.
 * That killed a model transfer mid-flight. An observer that changes what it observes is worse than no
 * observer, because the recording looks fine.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { EVIDENCE_DIR, KINDS, specFor } from './mesh-config.mjs';
import { connectSurface } from './sync-surface.mjs';

const [step = '0', ...rest] = process.argv.slice(2);
const note = rest.join(' ') || 'snapshot';
const slug = `${String(step).padStart(2, '0')}-${note.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
const dir = `${EVIDENCE_DIR}/manual/${slug}`;

await mkdir(dir, { recursive: true });
console.log(`\n=== step ${step}: ${note} ===`);

for (const kind of KINDS) {
  let surface;
  try {
    // Passive: a snapshot must never launch, foreground or restart an app. It exists to record a
    // journey somebody else is driving, and an observer that relaunches the app destroys the journey.
    surface = await connectSurface({ ...specFor(kind), passive: true });
    // Whatever screen the person left it on is the truth of this moment. openDevices is idempotent and
    // returns immediately when Devices is already showing, so this only navigates a device that has
    // wandered off - and never during a step the person is mid-way through.
    const text = await surface.text();
    await writeFile(`${dir}/${kind}.txt`, text);
    await surface.screenshot(`${dir}/${kind}.png`).catch(() => {});

    // The one-line summary is for reading in the terminal while the person works. The files hold
    // everything; this holds only what changes between steps.
    const lines = text.split('\n').map((line) => line.trim());
    const interesting = lines.filter((line) =>
      /Connected|Nearby|Offline|Needs repair|%|transferring|queued|verifying|completed|failed|Sending|Receiving|progress/i.test(
        line,
      ),
    );
    console.log(`  ${kind.padEnd(8)} ${interesting.slice(0, 6).join(' | ') || '(nothing notable)'}`);
    await surface.close();
  } catch (error) {
    console.log(`  ${kind.padEnd(8)} UNREACHABLE: ${error.message.split('\n')[0]}`);
    await surface?.close().catch(() => {});
  }
}

console.log(`  -> ${dir}`);
