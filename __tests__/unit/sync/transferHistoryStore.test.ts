import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_COMPLETED_TRANSFER_HISTORY_LIMIT,
  type CompletedTransferRecord,
  type FileTransferProgress,
} from '@offgrid/sync';
import { completedTransferHistory as history } from '../../../pro/sync/transferHistoryStore';

const STORAGE_KEY = 'offgrid-sync-transfer-history-v2';
const LEGACY_STORAGE_KEY = 'offgrid-sync-transfer-history-v1';

/**
 * The record of transfers that finished, which is all the user has once the progress bar is gone.
 *
 * A live transfer explains itself. A finished one has to be remembered, or "did that file actually go?" has no
 * answer after a relaunch - and this is a phone, so the app is killed constantly.
 *
 * Two things beyond storing. The device NAME is kept, not just the id, because a list of transfers that all say
 * "Paired device" tells nobody anything - and that is exactly what the older format stored, so the migration has
 * to be visible. And the history is bounded: a phone that has moved thousands of files must not read thousands of
 * rows on every launch.
 *
 * The shared CompletedTransferHistory owns the projection and the ordering; this adapter owns AsyncStorage, so the
 * tests drive the real pair together.
 */
describe('the record of transfers that finished', () => {
  const progress = (
    overrides: Partial<FileTransferProgress> = {},
  ): FileTransferProgress =>
    ({
      requestId: 'transfer-1',
      deviceId: 'the-mac',
      direction: 'receive',
      fileName: 'contract.pdf',
      bytesTransferred: 2048,
      totalBytes: 2048,
      status: 'completed',
      ...overrides,
    } as FileTransferProgress);

  const legacyEntry = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    requestId: 'transfer-legacy',
    deviceId: 'the-mac',
    direction: 'receive',
    fileName: 'from-the-old-format.pdf',
    bytesTransferred: 1024,
    totalBytes: 1024,
    status: 'completed',
    recordedAt: 1_700_000_000_000,
    ...overrides,
  });

  const record = (
    overrides: Partial<CompletedTransferRecord> = {},
  ): CompletedTransferRecord =>
    ({
      requestId: 'transfer-1',
      deviceId: 'the-mac',
      direction: 'receive',
      deviceName: "Mac's MacBook Pro",
      fileName: 'contract.pdf',
      bytesTransferred: 2048,
      totalBytes: 2048,
      completedAt: 1_700_000_000_000,
      ...overrides,
    } as CompletedTransferRecord);

  const load = (): typeof history =>
    require('../../../pro/sync/transferHistoryStore')
      .completedTransferHistory as typeof history;

  const reload = async (): Promise<typeof history> => {
    const store = load();
    await store.load();
    return store;
  };

  const plant = (
    entries: unknown[],
    version = 2,
    key = STORAGE_KEY,
  ): Promise<void> =>
    AsyncStorage.setItem(key, JSON.stringify({ version, entries }));

  beforeEach(async () => {
    jest.resetModules();
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    jest.restoreAllMocks();
  });

  describe('remembering one', () => {
    it('keeps the file, the device s name, and when it finished', async () => {
      const store = await reload();

      await store.record(progress(), "Mac's MacBook Pro");

      // The name is the point: a list where every row says "Paired device" answers nothing about where a file
      // came from or went.
      expect(store.list()).toEqual([
        expect.objectContaining({
          requestId: 'transfer-1',
          deviceName: "Mac's MacBook Pro",
          fileName: 'contract.pdf',
          bytesTransferred: 2048,
        }),
      ]);
    });

    it('survives the app being killed', async () => {
      const first = await reload();
      await first.record(progress(), 'The Mac');
      await first.flush();

      jest.resetModules();
      const next = await reload();

      // This is the whole reason it is stored: on a phone the app is killed constantly, and a history that only
      // lived in memory would answer "did that file go?" with silence every time.
      expect(next.list()).toHaveLength(1);
      expect(next.list()[0]?.deviceName).toBe('The Mac');
    });

    it('keeps one row per transfer, not one per report', async () => {
      const store = await reload();

      await store.record(progress(), 'The Mac');
      await store.record(progress(), 'The Mac');

      // A completion reported twice - a retry, or two listeners - is one transfer. Two rows would have the user
      // hunting for a second file that does not exist.
      expect(store.list()).toHaveLength(1);
    });

    it('tells a send apart from a receive of the same file', async () => {
      const store = await reload();

      await store.record(progress({ direction: 'receive' }), 'The Mac');
      await store.record(progress({ direction: 'send' }), 'The Mac');

      // Sending a file to the Mac and receiving it back are two events about one file, and collapsing them would
      // hide one direction entirely.
      expect(store.list()).toHaveLength(2);
    });

    it('tells the same transfer to two devices apart', async () => {
      const store = await reload();

      await store.record(progress({ deviceId: 'the-mac' }), 'The Mac');
      await store.record(progress({ deviceId: 'the-ipad' }), 'The iPad');

      expect(
        [...store.list().map(({ deviceName }) => deviceName)].sort(),
      ).toEqual(['The Mac', 'The iPad'].sort());
    });

    it('keeps what a finished transfer WAS, so a model still reads as a model', async () => {
      const store = await reload();

      await store.record(
        progress({ mimeType: 'application/vnd.offgrid.model' } as never),
        'The Mac',
      );
      await store.flush();
      jest.resetModules();

      // Without the type, a completed model transfer reads as a missing file after a relaunch - the row cannot
      // tell what it was showing.
      const next = await reload();
      expect(next.list()[0]?.mimeType).toBe('application/vnd.offgrid.model');
    });
  });

  describe('clearing one', () => {
    it('takes a dismissed row out, and keeps it out', async () => {
      const store = await reload();
      await store.record(progress(), 'The Mac');
      await store.flush();

      await expect(
        store.dismiss({
          requestId: 'transfer-1',
          deviceId: 'the-mac',
          direction: 'receive',
        }),
      ).resolves.toBe(true);

      expect(store.list()).toEqual([]);
      await store.flush();
      jest.resetModules();
      // Gone from storage too, or every launch resurrects what the user has already cleared.
      const next = await reload();
      expect(next.list()).toEqual([]);
    });

    it('says nothing was there when asked to clear a row it does not have', async () => {
      const store = await reload();

      await expect(
        store.dismiss({
          requestId: 'never-happened',
          deviceId: 'the-mac',
          direction: 'receive',
        }),
      ).resolves.toBe(false);
    });
  });

  describe('staying bounded', () => {
    it('keeps the newest and forgets the oldest', async () => {
      const store = await reload();
      const overflow = DEFAULT_COMPLETED_TRANSFER_HISTORY_LIMIT + 5;

      for (let index = 0; index < overflow; index += 1) {
        await store.record(
          progress({ requestId: `transfer-${index}` }),
          'The Mac',
        );
      }

      // A phone that has moved thousands of files must not read thousands of rows on every launch, and the rows
      // the user cares about are the recent ones.
      expect(store.list().length).toBeLessThanOrEqual(
        DEFAULT_COMPLETED_TRANSFER_HISTORY_LIMIT,
      );
      expect(store.list().map(({ requestId }) => requestId)).toContain(
        `transfer-${overflow - 1}`,
      );
    });

    it('reads back no more than the bound after a relaunch', async () => {
      const entries = Array.from(
        { length: DEFAULT_COMPLETED_TRANSFER_HISTORY_LIMIT + 20 },
        (_value, index) =>
          record({
            requestId: `transfer-${index}`,
            completedAt: 1_700_000_000_000 + index,
          }),
      );
      await plant(entries);

      const store = await reload();

      expect(store.list().length).toBeLessThanOrEqual(
        DEFAULT_COMPLETED_TRANSFER_HISTORY_LIMIT,
      );
      // The newest survive: an eviction that kept the oldest would show a history frozen at whenever the phone
      // first reached the limit.
      expect(store.list()[0]?.requestId).toBe(
        `transfer-${DEFAULT_COMPLETED_TRANSFER_HISTORY_LIMIT + 19}`,
      );
    });
  });

  describe('reading it back', () => {
    it('has nothing on a fresh install', async () => {
      const store = await reload();

      expect(store.list()).toEqual([]);
    });

    it('gives back the newest first', async () => {
      await plant([
        record({ requestId: 'older', completedAt: 1_700_000_000_000 }),
        record({ requestId: 'newer', completedAt: 1_700_000_600_000 }),
      ]);

      const store = await reload();

      expect(store.list().map(({ requestId }) => requestId)).toEqual([
        'newer',
        'older',
      ]);
    });

    it('drops a row it cannot read and keeps the rest', async () => {
      await plant([{ requestId: 'broken' }, record({ requestId: 'keep-me' })]);

      const store = await reload();

      // Judged by the shared parser, per row: one unreadable entry from an older build must not cost the user
      // their whole history.
      expect(store.list().map(({ requestId }) => requestId)).toEqual([
        'keep-me',
      ]);
    });

    it.each([
      ['the file is not readable at all', 'not json'],
      [
        'it is not the shape this build writes',
        JSON.stringify({ entries: [] }),
      ],
      [
        'it is a version this build does not know',
        JSON.stringify({ version: 99, entries: [] }),
      ],
      [
        'the entries are not a list',
        JSON.stringify({ version: 2, entries: {} }),
      ],
    ])('starts empty when %s', async (_label, stored) => {
      await AsyncStorage.setItem(STORAGE_KEY, stored);

      const store = await reload();

      // Empty rather than a throw: this loads while the Activity screen renders, and the next transfer refills it.
      expect(store.list()).toEqual([]);
    });

    it('shares one load between everything that asks at once', async () => {
      await plant([record()]);
      const store = load();

      await Promise.all([store.load(), store.load(), store.load()]);

      // Several surfaces read the history on launch. Loading three times could interleave with a write, and the
      // list would be built from a half-written file.
      expect(store.list()).toHaveLength(1);
    });
  });

  describe('a history written by an older build', () => {
    it('reads it, and says the device is one it cannot name', async () => {
      await plant([legacyEntry()], 1, LEGACY_STORAGE_KEY);

      const store = await reload();

      // The old format never stored a name. Migrating to a placeholder keeps the transfer visible - losing the
      // row entirely would be worse than a row that cannot say which device it was.
      expect(store.list()).toEqual([
        expect.objectContaining({
          requestId: 'transfer-legacy',
          fileName: 'from-the-old-format.pdf',
          deviceName: 'Paired device',
          completedAt: 1_700_000_000_000,
        }),
      ]);
    });

    it('keeps only what actually finished', async () => {
      await plant(
        [
          legacyEntry({ requestId: 'finished' }),
          legacyEntry({ requestId: 'failed-one', status: 'failed' }),
        ],
        1,
        LEGACY_STORAGE_KEY,
      );

      const store = await reload();

      // The old format stored live and failed rows too. This history is about completions, and importing a failure
      // as one would tell the user a file arrived that never did.
      expect(store.list().map(({ requestId }) => requestId)).toEqual([
        'finished',
      ]);
    });

    it('ignores the old file once the new one exists', async () => {
      await plant([record({ requestId: 'from-the-new-format' })]);
      await plant([legacyEntry()], 1, LEGACY_STORAGE_KEY);

      const store = await reload();

      // Migration happens once. Reading both afterwards would resurrect rows the user had already dismissed in
      // the new format.
      expect(store.list().map(({ requestId }) => requestId)).toEqual([
        'from-the-new-format',
      ]);
    });

    it('starts empty when the old file cannot be read either', async () => {
      await AsyncStorage.setItem(LEGACY_STORAGE_KEY, '{ truncated');

      const store = await reload();

      expect(store.list()).toEqual([]);
    });

    it('drops an old row that is not a row at all', async () => {
      await plant(['a bare string', legacyEntry()], 1, LEGACY_STORAGE_KEY);

      const store = await reload();

      expect(store.list()).toHaveLength(1);
    });

    it('writes what it migrated in the new format', async () => {
      await plant([legacyEntry()], 1, LEGACY_STORAGE_KEY);
      const store = await reload();

      await store.record(progress(), 'The Mac');
      await store.flush();

      // The migration is only durable once something writes. From then on the new file is authoritative and the
      // old one is never read again.
      const stored = JSON.parse(
        (await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null',
      );
      expect(stored.version).toBe(2);
      expect(
        stored.entries
          .map((entry: { requestId: string }) => entry.requestId)
          .sort(),
      ).toEqual(['transfer-1', 'transfer-legacy']);
    });
  });

  it('carries on writing after a write that failed', async () => {
    const store = await reload();
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('the disk is full'));

    await store.record(progress({ requestId: 'first' }), 'The Mac');
    await store.flush().catch(() => undefined);
    jest.restoreAllMocks();
    await store.record(progress({ requestId: 'second' }), 'The Mac');
    await store.flush();
    // A third, to prove the queue is healthy rather than merely having recovered once.
    await store.record(progress({ requestId: 'third' }), 'The Mac');
    await store.flush();

    // The write queue is serial, so one failure must not poison it - a single full-disk moment would otherwise
    // stop every later transfer from ever being remembered.
    const stored = JSON.parse(
      (await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null',
    );
    expect(
      stored.entries
        .map((entry: { requestId: string }) => entry.requestId)
        .sort(),
    ).toEqual(['first', 'second', 'third']);
  });

  it('tells the screens when the history changes', async () => {
    const store = await reload();
    const changes: number[] = [];
    const unsubscribe = store.onChanged(() => changes.push(1));

    await store.record(progress(), 'The Mac');

    expect(changes.length).toBeGreaterThan(0);
    unsubscribe();
    await store.record(progress({ requestId: 'transfer-2' }), 'The Mac');
    // Unsubscribed means unsubscribed: a screen that has gone away must not be re-rendered.
    expect(changes.length).toBe(1);
    store.dispose();
  });
});
