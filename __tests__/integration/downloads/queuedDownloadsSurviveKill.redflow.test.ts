/**
 * RED-FLOW (integration) — queued (not-yet-started) model downloads vanish on an app kill.
 *
 * Product rule (from the Download Manager's point of view): a model the user asked to download
 * NEVER silently disappears. The 3-slot concurrency cap means a 4th+ start WAITS in an in-memory
 * FIFO (backgroundDownloadService.startQueue) as a `pending` store row with a `queued:<modelKey>`
 * placeholder id. Nothing durable is written for a queued item — the native Room/URLSession row is
 * only created when a download ACTUALLY starts. So on relaunch, hydrateDownloadStore() (which rebuilds
 * the store ONLY from native rows) leaves the queued items absent → they vanish.
 *
 * Integration boundary: the ONLY fakes are the device boundary — the background-download native module
 * (NativeModules.DownloadManagerModule + NativeEventEmitter, exactly as the service test does it) and
 * AsyncStorage (the jest.setup in-memory fake, whose mockStorage PERSISTS across jest.resetModules()
 * re-imports within one test — that IS how we model kill→relaunch: re-import the service fresh + reset
 * the store to empty, but the persisted queue survives). NO jest.mock of anything under src/. The REAL
 * backgroundDownloadService + REAL useDownloadStore + REAL restore run.
 *
 * Assert the TERMINAL artifact: the useDownloadStore rows a user would see in the Download Manager.
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const flush = () => new Promise<void>((r) => setImmediate(r));

// --- device-boundary fake: the native DownloadManagerModule (stateful active set) + event emitter ---
const mockDownloadManagerModule = {
  startDownload: jest.fn(),
  cancelDownload: jest.fn(),
  retryDownload: jest.fn(),
  getActiveDownloads: jest.fn(async (): Promise<any[]> => []),
  moveCompletedDownload: jest.fn(),
  startProgressPolling: jest.fn(),
  stopProgressPolling: jest.fn(),
  requestNotificationPermission: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

const originalOS = Platform.OS;

/** Reconstruct a text ModelFile from a modelKey (repo/file) so the real start path can run. */
const fileFor = (modelId: string, fileName: string, size = 4_000_000_000) => ({
  name: fileName,
  size,
  quantization: 'Q4_K_M',
  downloadUrl: `https://example.com/${modelId}/${fileName}`,
});

describe('queued downloads survive an app kill (red-flow)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NativeModules.DownloadManagerModule = mockDownloadManagerModule;
    jest
      .spyOn(NativeEventEmitter.prototype, 'addListener')
      .mockImplementation((_e: string, _h: any) => ({ remove: jest.fn() } as any));
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    // Each native start returns a unique real downloadId so 3 slots genuinely fill.
    let seq = 0;
    mockDownloadManagerModule.startDownload.mockImplementation(async () => ({
      downloadId: `native-${++seq}`,
      fileName: 'f.gguf',
      modelId: 'm',
    }));
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS });
  });

  it('re-surfaces a queued (never-started) download as a pending row after relaunch', async () => {
    // ---- Session 1: enqueue > 3 text downloads so at least one is queued past the 3-slot cap. ----
    /* eslint-disable @typescript-eslint/no-var-requires */
    let startModelDownload = require('../../../src/services/startModelDownload').startModelDownload;
    let useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    let makeModelKey = require('../../../src/utils/modelKey').makeModelKey;
    /* eslint-enable @typescript-eslint/no-var-requires */

    const models = [
      { id: 'org/a', file: 'a.gguf' },
      { id: 'org/b', file: 'b.gguf' },
      { id: 'org/c', file: 'c.gguf' },
      { id: 'org/d', file: 'd.gguf' }, // 4th → queued (cap is 3)
      { id: 'org/e', file: 'e.gguf' }, // 5th → queued
    ];
    for (const m of models) {
      // Do not await (the queued ones never resolve until a slot frees) — fire and continue.
      startModelDownload(m.id, fileFor(m.id, m.file)).catch(() => {});
    }
    await flush();

    // Precondition: all 5 have a store row; d + e are still queued placeholders (never started native).
    const dKey = makeModelKey('org/d', 'd.gguf');
    const eKey = makeModelKey('org/e', 'e.gguf');
    expect(useDownloadStore.getState().downloads[dKey]?.downloadId).toBe(`queued:${dKey}`);
    expect(useDownloadStore.getState().downloads[eKey]?.downloadId).toBe(`queued:${eKey}`);

    // ---- Kill → relaunch: re-import service fresh, reset the store to empty; native has NO rows for
    // the queued ones (they never started). The persisted AsyncStorage queue survives resetModules. ----
    jest.resetModules();
    NativeModules.DownloadManagerModule = mockDownloadManagerModule;
    mockDownloadManagerModule.getActiveDownloads.mockResolvedValue([]); // relaunch: nothing active natively

    /* eslint-disable @typescript-eslint/no-var-requires */
    useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    makeModelKey = require('../../../src/utils/modelKey').makeModelKey;
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { restoreQueuedDownloads } = require('../../../src/services/restoreQueuedDownloads');
    /* eslint-enable @typescript-eslint/no-var-requires */

    // Fresh store starts empty (a cold relaunch).
    expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(0);

    await hydrateDownloadStore(); // rebuilds from native — no queued rows here (they never started)
    registerCoreDownloadProviders(); // providers registered BEFORE restore dispatches to them
    await restoreQueuedDownloads();
    await flush();

    // TERMINAL artifact: the queued models are BACK in the store (pending/active), never absent, never failed.
    const dRelaunch = makeModelKey('org/d', 'd.gguf');
    const eRelaunch = makeModelKey('org/e', 'e.gguf');
    const dEntry = useDownloadStore.getState().downloads[dRelaunch];
    const eEntry = useDownloadStore.getState().downloads[eRelaunch];
    expect(dEntry).toBeDefined();
    expect(eEntry).toBeDefined();
    expect(dEntry.status).not.toBe('failed');
    expect(eEntry.status).not.toBe('failed');
  });

  it('no regression: an in-flight (started) download still hydrates via the native path', async () => {
    // The 3 that actually started have native rows that survive; hydrate recovers them exactly as
    // before. restore must run alongside without disturbing them (they are not queued items).
    jest.resetModules();
    NativeModules.DownloadManagerModule = mockDownloadManagerModule;
    const aKey = 'org/a/a.gguf';
    mockDownloadManagerModule.getActiveDownloads.mockResolvedValue([
      { downloadId: 'native-a', modelKey: aKey, modelId: 'org/a', fileName: 'a.gguf', modelType: 'text', status: 'running', bytesDownloaded: 100, totalBytes: 4_000_000_000 },
    ]);
    /* eslint-disable @typescript-eslint/no-var-requires */
    const useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { restoreQueuedDownloads } = require('../../../src/services/restoreQueuedDownloads');
    /* eslint-enable @typescript-eslint/no-var-requires */

    await hydrateDownloadStore();
    registerCoreDownloadProviders();
    await restoreQueuedDownloads();
    await flush();

    // The started download is present with its native id + running status (unchanged by restore).
    const entry = useDownloadStore.getState().downloads[aKey];
    expect(entry).toBeDefined();
    expect(entry.downloadId).toBe('native-a');
    expect(entry.status).toBe('running');
  });

  it('does not resurrect a queued download that was CANCELLED before the kill', async () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const startModelDownload = require('../../../src/services/startModelDownload').startModelDownload;
    const { backgroundDownloadService } = require('../../../src/services/backgroundDownloadService');
    let useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    let makeModelKey = require('../../../src/utils/modelKey').makeModelKey;
    /* eslint-enable @typescript-eslint/no-var-requires */

    const models = [
      { id: 'org/a', file: 'a.gguf' },
      { id: 'org/b', file: 'b.gguf' },
      { id: 'org/c', file: 'c.gguf' },
      { id: 'org/d', file: 'd.gguf' }, // queued
    ];
    for (const m of models) {
      startModelDownload(m.id, fileFor(m.id, m.file)).catch(() => {});
    }
    await flush();

    const dKey = makeModelKey('org/d', 'd.gguf');
    // Cancel the queued one via the queue owner (the same key the UI cancel routes to).
    backgroundDownloadService.cancelQueued(dKey);
    useDownloadStore.getState().remove(dKey);
    await flush();

    // ---- relaunch ----
    jest.resetModules();
    NativeModules.DownloadManagerModule = mockDownloadManagerModule;
    mockDownloadManagerModule.getActiveDownloads.mockResolvedValue([]);
    /* eslint-disable @typescript-eslint/no-var-requires */
    useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    makeModelKey = require('../../../src/utils/modelKey').makeModelKey;
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { restoreQueuedDownloads } = require('../../../src/services/restoreQueuedDownloads');
    /* eslint-enable @typescript-eslint/no-var-requires */

    await hydrateDownloadStore();
    registerCoreDownloadProviders();
    await restoreQueuedDownloads();
    await flush();

    // The cancelled queued item must NOT come back.
    const dRelaunch = makeModelKey('org/d', 'd.gguf');
    expect(useDownloadStore.getState().downloads[dRelaunch]).toBeUndefined();
  });

  it('skips a persisted queued item whose model already started (dedupes against the native row)', async () => {
    // A queued item that got persisted, then STARTED (native row) before the kill: on relaunch it is
    // hydrated from native. Restore must NOT re-add a duplicate — it dedupes against the store row.
    jest.resetModules();
    NativeModules.DownloadManagerModule = mockDownloadManagerModule;
    const key = 'org/dupe/x.gguf';
    mockDownloadManagerModule.getActiveDownloads.mockResolvedValue([
      { downloadId: 'native-x', modelKey: key, modelId: 'org/dupe', fileName: 'x.gguf', modelType: 'text', status: 'running', bytesDownloaded: 5, totalBytes: 1000 },
    ]);
    /* eslint-disable @typescript-eslint/no-var-requires */
    const useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { restoreQueuedDownloads } = require('../../../src/services/restoreQueuedDownloads');
    const { saveQueuedDownloads } = require('../../../src/services/queuedDownloadPersistence');
    /* eslint-enable @typescript-eslint/no-var-requires */

    // Persist the SAME model as a queued item (as if it were queued when persisted, then started).
    await saveQueuedDownloads([{ url: 'https://x/x.gguf', fileName: 'x.gguf', modelId: 'org/dupe', modelKey: key, modelType: 'text', totalBytes: 1000 }]);

    await hydrateDownloadStore();
    registerCoreDownloadProviders();
    await restoreQueuedDownloads();
    await flush();

    // Exactly ONE row for the model — the hydrated native one, not a re-issued duplicate.
    const rows = Object.values(useDownloadStore.getState().downloads).filter((e: any) => e.modelKey === key);
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).downloadId).toBe('native-x');
  });

  it('a reissue that throws is swallowed and does not abort restoring the rest', async () => {
    jest.resetModules();
    NativeModules.DownloadManagerModule = mockDownloadManagerModule;
    mockDownloadManagerModule.getActiveDownloads.mockResolvedValue([]);
    // Native start throws for the FIRST re-issued item; succeeds after.
    let calls = 0;
    mockDownloadManagerModule.startDownload.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error('native start boom');
      return { downloadId: `native-ok-${calls}`, fileName: 'f', modelId: 'm' };
    });
    /* eslint-disable @typescript-eslint/no-var-requires */
    const useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { restoreQueuedDownloads } = require('../../../src/services/restoreQueuedDownloads');
    const { saveQueuedDownloads } = require('../../../src/services/queuedDownloadPersistence');
    /* eslint-enable @typescript-eslint/no-var-requires */

    await saveQueuedDownloads([
      { url: 'https://x/boom.gguf', fileName: 'boom.gguf', modelId: 'org/boom', modelKey: 'org/boom/boom.gguf', modelType: 'text', totalBytes: 1000 },
      { url: 'https://x/ok.gguf', fileName: 'ok.gguf', modelId: 'org/ok', modelKey: 'org/ok/ok.gguf', modelType: 'text', totalBytes: 1000 },
    ]);

    await hydrateDownloadStore();
    registerCoreDownloadProviders();
    // Must not reject even though the first reissue's native start throws.
    await expect(restoreQueuedDownloads()).resolves.toBeUndefined();
    await flush();

    // The second (ok) item still got re-issued despite the first failing.
    const ok = useDownloadStore.getState().downloads['org/ok/ok.gguf'];
    expect(ok).toBeDefined();
  });

  it('empty queue → restore is a no-op (no phantom rows)', async () => {
    jest.resetModules();
    NativeModules.DownloadManagerModule = mockDownloadManagerModule;
    mockDownloadManagerModule.getActiveDownloads.mockResolvedValue([]);
    /* eslint-disable @typescript-eslint/no-var-requires */
    const useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
    const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
    const { restoreQueuedDownloads } = require('../../../src/services/restoreQueuedDownloads');
    /* eslint-enable @typescript-eslint/no-var-requires */

    await hydrateDownloadStore();
    registerCoreDownloadProviders();
    await restoreQueuedDownloads();
    await flush();

    expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(0);
  });

  it('does not double-issue a queued download on a SECOND relaunch (queue cleared as re-issued)', async () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const startModelDownload = require('../../../src/services/startModelDownload').startModelDownload;
    let useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
    let makeModelKey = require('../../../src/utils/modelKey').makeModelKey;
    /* eslint-enable @typescript-eslint/no-var-requires */

    for (const m of [
      { id: 'org/a', file: 'a.gguf' },
      { id: 'org/b', file: 'b.gguf' },
      { id: 'org/c', file: 'c.gguf' },
      { id: 'org/d', file: 'd.gguf' }, // queued
    ]) {
      startModelDownload(m.id, fileFor(m.id, m.file)).catch(() => {});
    }
    await flush();

    const relaunch = (activeRows: any[] = []) => {
      jest.resetModules();
      NativeModules.DownloadManagerModule = mockDownloadManagerModule;
      mockDownloadManagerModule.getActiveDownloads.mockResolvedValue(activeRows);
      /* eslint-disable @typescript-eslint/no-var-requires */
      useDownloadStore = require('../../../src/stores/downloadStore').useDownloadStore;
      makeModelKey = require('../../../src/utils/modelKey').makeModelKey;
      const { hydrateDownloadStore } = require('../../../src/services/downloadHydration');
      const { registerCoreDownloadProviders } = require('../../../src/services/modelDownloadService/registerProviders');
      const { restoreQueuedDownloads } = require('../../../src/services/restoreQueuedDownloads');
      /* eslint-enable @typescript-eslint/no-var-requires */
      return (async () => {
        await hydrateDownloadStore();
        registerCoreDownloadProviders();
        await restoreQueuedDownloads();
        await flush();
      })();
    };

    await relaunch();
    const dKey = makeModelKey('org/d', 'd.gguf');
    expect(useDownloadStore.getState().downloads[dKey]).toBeDefined();

    // On the first relaunch 'd' was the only queued item and the cap was free, so it STARTED natively
    // (a real native row now exists — Android WorkManager persists it). Model that on the second
    // relaunch so hydrate recovers 'd' via the native path; restore must dedupe against it and NOT
    // re-add a duplicate 'd'.
    await relaunch([
      { downloadId: 'native-d', modelKey: dKey, modelId: 'org/d', fileName: 'd.gguf', modelType: 'text', status: 'running', bytesDownloaded: 10, totalBytes: 4_000_000_000 },
    ]);
    const entries = Object.values(useDownloadStore.getState().downloads).filter(
      (e: any) => e.modelKey === makeModelKey('org/d', 'd.gguf'),
    );
    expect(entries).toHaveLength(1);
  });
});
