/**
 * Physical Android -> mesh generated-image journey.
 *
 * Preconditions: the four apps are already paired and connected. This runner does not change mesh
 * membership. It starts one image on Android and observes every named peer at the same time.
 *
 * Run on the Mac that owns WDA and both desktop CDP endpoints:
 *   npm run e2e:image-sync
 *   npm run e2e:image-sync -- --mesh ios,macos,windows --timeout-minutes 30
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EVIDENCE_DIR, flag, specFor } from './mesh-config.mjs';
import { generatedImageSurface } from './generated-image-surface.mjs';
import { connectSurface } from './sync-surface.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (value) => value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '');
const minutes = (name, fallback) => {
  const value = Number(flag(name, String(fallback)));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number`);
  return value * 60_000;
};

const observerKinds = flag('mesh', 'ios,macos,windows')
  .split(',')
  .map((kind) => kind.trim().toLowerCase())
  .filter(Boolean);
if (observerKinds.length === 0) throw new Error('--mesh names no observers');
if (observerKinds.includes('android')) throw new Error('Android is the producer; do not repeat it in --mesh');
if (new Set(observerKinds).size !== observerKinds.length) throw new Error('--mesh repeats an observer');

const liveTimeoutMs = minutes('live-timeout-minutes', 5);
const finalTimeoutMs = minutes('timeout-minutes', 30);
const discoveryTimeoutMs = minutes('discovery-timeout-minutes', 5);
const runId = `android-to-mesh-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const evidenceDir = join(EVIDENCE_DIR, 'generated-image-sync', runId);
const token = `meshproof${Date.now()}`;
const prompt = `draw a simple green square robot keep marker ${token} unchanged`;
const connected = [];
const results = [];

await mkdir(evidenceDir, { recursive: true });

const capture = async (surface, phase) => {
  const path = join(evidenceDir, `${safe(surface.platform)}--${safe(phase)}.png`);
  await surface.screenshot(path);
  return path;
};

const observe = async (surface, baseline, { alreadyOpen = false } = {}) => {
  const started = Date.now();
  try {
    if (!alreadyOpen) await surface.openIncomingConversation(token, discoveryTimeoutMs);
    console.log(`OPEN  ${surface.platform.padEnd(8)} synced conversation`);
    const live = await surface.waitForLiveState(liveTimeoutMs);
    const liveShot = await capture(surface, 'live');
    console.log(`LIVE  ${surface.platform.padEnd(8)} ${String(live).split('\n')[0]}`);
    const final = await surface.waitForFinal(token, finalTimeoutMs);
    const finalShot = await capture(surface, 'final');
    console.log(`FINAL ${surface.platform.padEnd(8)} grouped image is decoded`);
    const gallery = await surface.verifyGallery(token, baseline, finalTimeoutMs);
    const galleryShot = await capture(surface, 'gallery');
    const result = {
      platform: surface.platform,
      ok: true,
      live,
      final,
      gallery,
      evidence: { live: liveShot, final: finalShot, gallery: galleryShot },
      ms: Date.now() - started,
    };
    results.push(result);
    console.log(`PASS  ${surface.platform.padEnd(8)} live, final image, and Gallery`);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const failureShot = await capture(surface, 'FAILED').catch(() => undefined);
    const result = {
      platform: surface.platform,
      ok: false,
      reason,
      evidence: failureShot ? { failure: failureShot } : {},
      ms: Date.now() - started,
    };
    results.push(result);
    console.log(`FAIL  ${surface.platform.padEnd(8)} ${reason}`);
    return result;
  }
};

try {
  console.log(`\nAndroid -> mesh generated-image journey`);
  console.log(`marker: ${token}`);
  console.log(`evidence: ${evidenceDir}\n`);

  const kinds = ['android', ...observerKinds];
  const connections = await Promise.allSettled(
    kinds.map((kind) => connectSurface(specFor(kind))),
  );
  const rawSurfaces = connections
    .filter((connection) => connection.status === 'fulfilled')
    .map((connection) => connection.value);
  connected.push(...rawSurfaces);
  const connectionFailures = connections
    .map((connection, index) => ({ connection, kind: kinds[index] }))
    .filter(({ connection }) => connection.status === 'rejected');
  if (connectionFailures.length > 0) {
    throw new Error(
      connectionFailures
        .map(({ connection, kind }) => `${kind}: ${connection.reason?.message ?? connection.reason}`)
        .join('; '),
    );
  }
  const [producer, ...observers] = rawSurfaces.map(generatedImageSurface);

  const baselines = new Map(
    await Promise.all(
      [producer, ...observers].map(async (surface) => [surface.platform, await surface.galleryBaseline()]),
    ),
  );
  await Promise.all(observers.map((surface) => surface.prepareForIncoming()));

  // Start every observer before Android sends. This is what makes temporary Enhancing/Loading/
  // Generating frames observable instead of checking only the durable record after the fact.
  const observerRuns = observers.map((surface) =>
    observe(surface, baselines.get(surface.platform)),
  );
  await sleep(500);
  await producer.startGeneration(prompt);
  const producerRun = observe(producer, baselines.get(producer.platform), { alreadyOpen: true });

  await Promise.all([producerRun, ...observerRuns]);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.log(`FAIL  preflight ${reason}`);
  results.push({ platform: 'preflight', ok: false, reason, ms: 0 });
  await Promise.all(
    connected.map(async (surface) => {
      const adapter = generatedImageSurface(surface);
      await capture(adapter, 'PRECHECK-FAILED').catch(() => undefined);
    }),
  );
} finally {
  await writeFile(
    join(evidenceDir, 'result.json'),
    `${JSON.stringify({ runId, token, prompt, observerKinds, results }, null, 2)}\n`,
  );
  await Promise.all(connected.map((surface) => Promise.resolve(surface.close()).catch(() => undefined)));
}

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} surfaces passed`);
console.log(`result: ${join(evidenceDir, 'result.json')}`);
process.exitCode = failures.length > 0 ? 1 : 0;
