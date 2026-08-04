import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  syncFileCompletionNotificationId,
  type SharedFileDescriptor,
  type SyncFileCompletionNotificationFact,
} from '@offgrid/sync';
import { fileCompletionNotificationService as notifications } from '../../../pro/sync/fileCompletionNotificationService';

const STORAGE_KEY = 'offgrid-sync-file-notifications-v1';

/**
 * The list that tells you a file actually arrived.
 *
 * A transfer that finishes silently is indistinguishable from one that never happened, so this is the record
 * that says "this file, from this device, at this time" - and it has to survive the app closing, because a
 * transfer often completes while the phone is in a pocket.
 *
 * What makes it more than a list is that read and dismissed are per NOTIFICATION, not per file: dismissing the
 * copy that arrived from the Mac must not hide the one that arrived from the iPad. The projection that decides
 * what is shown lives in the shared package, so this only stores and forwards - which means the interesting
 * behaviour is the storage: a decision remembered against a notification that no longer exists would keep
 * hiding a future arrival that happened to reuse its id.
 */
describe('the list that says a file arrived', () => {
  const file = (
    overrides: Partial<SharedFileDescriptor> = {},
  ): SharedFileDescriptor =>
    ({
      syncId: '4c3b2a19-8f7e-4d6c-9b5a-4c3d2e1f0a9b',
      kind: 'file',
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      createdAt: '2026-08-04T09:00:00.000Z',
      ...overrides,
    } as SharedFileDescriptor);

  const fact = (
    overrides: Partial<SyncFileCompletionNotificationFact> = {},
  ): SyncFileCompletionNotificationFact =>
    ({
      syncId: '4c3b2a19-8f7e-4d6c-9b5a-4c3d2e1f0a9b',
      direction: 'receive',
      deviceId: 'the-mac',
      deviceName: "Mac's MacBook Pro",
      name: 'contract.pdf',
      kind: 'file',
      completedAt: 1_700_000_000_000,
      available: true,
      ...overrides,
    } as SyncFileCompletionNotificationFact);

  /**
   * A fresh service over the same module singleton.
   *
   * The service is a singleton because the gate is one fact about the device, so each test resets storage and
   * re-loads it - which is also the only way to exercise `load`, the path a real launch takes.
   */
  const load = (): typeof notifications =>
    require('../../../pro/sync/fileCompletionNotificationService')
      .fileCompletionNotificationService as typeof notifications;

  const reload = async (): Promise<typeof notifications> => {
    const service = load();
    await service.start();
    return service;
  };

  const plant = (value: unknown): Promise<void> =>
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));

  beforeEach(async () => {
    jest.resetModules();
    await AsyncStorage.removeItem(STORAGE_KEY);
    jest.restoreAllMocks();
  });

  describe('recording an arrival', () => {
    it('shows the file, the device it came from, and when', async () => {
      const service = await reload();

      await service.record(fact());

      const [item] = service.snapshot().items;
      expect(item).toMatchObject({
        syncId: fact().syncId,
        direction: 'receive',
        deviceName: "Mac's MacBook Pro",
        name: 'contract.pdf',
      });
      // Unread to begin with: the point of the list is that something new is in it.
      expect(service.snapshot().unreadCount).toBe(1);
    });

    it('records a file this phone sent, to the device it went to', async () => {
      const service = await reload();

      service.recordSent(file(), {
        deviceId: 'the-mac',
        deviceName: 'The Mac',
      });
      await service.start();

      const items = service.snapshot().items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        direction: 'send',
        deviceName: 'The Mac',
      });
    });

    it('says nothing when a sent file had no destination', async () => {
      const service = await reload();

      service.recordSent(file(), undefined);

      // A send with nobody to send to is not an event: it would appear as "sent to undefined".
      expect(service.snapshot().items).toEqual([]);
    });

    it('records a file that arrived, attributed to its origin', async () => {
      const service = await reload();

      service.recordReceived(file(), {
        originDeviceId: 'the-ipad',
        originDeviceName: 'The iPad',
      });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(service.snapshot().items[0]).toMatchObject({
        direction: 'receive',
        deviceId: 'the-ipad',
        deviceName: 'The iPad',
      });
    });

    it('keeps one notification per file and device, not one per attempt', async () => {
      const service = await reload();

      await service.record(fact());
      await service.record(fact({ completedAt: 1_700_000_060_000 }));

      // A retried transfer completing twice is one arrival. Two rows would have the user open the same file
      // twice looking for the difference.
      expect(service.snapshot().items).toHaveLength(1);
    });

    it('shows the same file from two devices separately', async () => {
      const service = await reload();

      await service.record(
        fact({ deviceId: 'the-mac', deviceName: 'The Mac' }),
      );
      await service.record(
        fact({ deviceId: 'the-ipad', deviceName: 'The iPad' }),
      );

      // Two devices sending you the same document is two events - and dismissing one must not hide the other,
      // which is why the ids are per notification rather than per file.
      expect(service.snapshot().items).toHaveLength(2);
    });

    it('ignores an arrival it cannot make sense of', async () => {
      const service = await reload();

      await service.record({
        syncId: '',
      } as SyncFileCompletionNotificationFact);
      await service.record(fact({ direction: 'sideways' as never }));

      // Admitted through the shared projection, so the phone shows exactly what the mesh considers a valid
      // notification - and a malformed one is dropped rather than rendering as a blank row.
      expect(service.snapshot().items).toEqual([]);
    });
  });

  describe('reading and dismissing', () => {
    it('marks one as read without touching the others', async () => {
      const service = await reload();
      await service.record(fact({ deviceId: 'the-mac' }));
      await service.record(fact({ deviceId: 'the-ipad' }));
      const [first] = service.snapshot().items;

      await service.markRead(first!.id);

      expect(service.snapshot().unreadCount).toBe(1);
    });

    it('marks everything read at once', async () => {
      const service = await reload();
      await service.record(fact({ deviceId: 'the-mac' }));
      await service.record(fact({ deviceId: 'the-ipad' }));

      await service.markAllRead();

      expect(service.snapshot().unreadCount).toBe(0);
      // Still in the list: read is not gone, and the user may still want to open the file.
      expect(service.snapshot().items).toHaveLength(2);
    });

    it('does nothing when everything is already read', async () => {
      const service = await reload();
      await service.record(fact());
      await service.markAllRead();
      const changes: number[] = [];
      service.onChanged(() => changes.push(1));

      await service.markAllRead();

      // No write and no notify: this runs whenever the screen opens, and re-rendering the list on every visit
      // for nothing is exactly the cost that makes a list feel slow.
      expect(changes).toEqual([]);
    });

    it('does nothing when the one it is asked to mark is already read', async () => {
      const service = await reload();
      await service.record(fact());
      const [item] = service.snapshot().items;
      await service.markRead(item!.id);
      const changes: number[] = [];
      service.onChanged(() => changes.push(1));

      await service.markRead(item!.id);

      expect(changes).toEqual([]);
    });

    it('takes a dismissed one out of the list', async () => {
      const service = await reload();
      await service.record(fact({ deviceId: 'the-mac' }));
      await service.record(fact({ deviceId: 'the-ipad' }));
      const [first] = service.snapshot().items;

      await service.dismiss(first!.id);

      const remaining = service.snapshot().items;
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).not.toBe(first!.id);
    });

    it('clears the whole list at once', async () => {
      const service = await reload();
      await service.record(fact({ deviceId: 'the-mac' }));
      await service.record(fact({ deviceId: 'the-ipad' }));

      await service.dismissAll();

      expect(service.snapshot().items).toEqual([]);
    });

    it('does nothing when there is nothing left to clear', async () => {
      const service = await reload();
      await service.record(fact());
      await service.dismissAll();
      const changes: number[] = [];
      service.onChanged(() => changes.push(1));

      await service.dismissAll();

      expect(changes).toEqual([]);
    });

    it('does nothing when the one it is asked to dismiss is already gone', async () => {
      const service = await reload();
      await service.record(fact());
      const [item] = service.snapshot().items;
      await service.dismiss(item!.id);
      const changes: number[] = [];
      service.onChanged(() => changes.push(1));

      await service.dismiss(item!.id);

      expect(changes).toEqual([]);
    });
  });

  describe('a file that is no longer on the phone', () => {
    it('says so, so the row does not offer to open nothing', async () => {
      const service = await reload();
      await service.record(fact());

      await service.setAvailable(fact().syncId, false);

      // The bytes were deleted or the transfer was cleaned up. The row stays - the arrival still happened - but
      // it must not offer to open a file that is not there.
      expect(service.snapshot().items[0]?.available).toBe(false);
    });

    it('updates every notification about that file', async () => {
      const service = await reload();
      await service.record(fact({ deviceId: 'the-mac' }));
      await service.record(fact({ deviceId: 'the-ipad' }));

      await service.setAvailable(fact().syncId, false);

      // One file, two arrivals: the bytes are gone for both, so a row that still offered to open it would be
      // wrong for whichever device the user tapped.
      expect(
        service.snapshot().items.every(({ available }) => !available),
      ).toBe(true);
    });

    it('does nothing when it already says that', async () => {
      const service = await reload();
      await service.record(fact());
      const changes: number[] = [];
      service.onChanged(() => changes.push(1));

      await service.setAvailable(fact().syncId, true);

      expect(changes).toEqual([]);
    });

    it('does nothing for a file it has no notification about', async () => {
      const service = await reload();
      await service.record(fact());
      const changes: number[] = [];
      service.onChanged(() => changes.push(1));

      await service.setAvailable('a-file-it-never-saw', false);

      expect(changes).toEqual([]);
    });
  });

  describe('surviving a relaunch', () => {
    it('reads back the arrivals and which were read', async () => {
      const first = await reload();
      await first.record(fact({ deviceId: 'the-mac' }));
      await first.record(fact({ deviceId: 'the-ipad' }));
      const [one] = first.snapshot().items;
      await first.markRead(one!.id);

      jest.resetModules();
      const next = await reload();

      // A transfer usually completes while the phone is in a pocket, so this list is read for the first time
      // after a relaunch far more often than during the session that filled it.
      expect(next.snapshot().items).toHaveLength(2);
      expect(next.snapshot().unreadCount).toBe(1);
    });

    it('reads back which were dismissed', async () => {
      const first = await reload();
      await first.record(fact({ deviceId: 'the-mac' }));
      await first.record(fact({ deviceId: 'the-ipad' }));
      const [one] = first.snapshot().items;
      await first.dismiss(one!.id);

      jest.resetModules();
      const next = await reload();

      // Otherwise every launch resurrects notifications the user has already cleared.
      expect(next.snapshot().items).toHaveLength(1);
    });

    it('starts empty on a fresh install', async () => {
      const service = await reload();

      expect(service.snapshot().items).toEqual([]);
      expect(service.snapshot().unreadCount).toBe(0);
    });

    it('shares one load between everything that asks at once', async () => {
      await plant({
        version: 1,
        completions: [fact()],
        readIds: [],
        dismissedIds: [],
      });
      const service = load();

      await Promise.all([service.start(), service.start(), service.start()]);

      // Several screens mount at once on launch and each calls start. They share the one in-flight load, so the
      // list is not built three times from three interleaved reads - which would double every arrival in it.
      expect(service.snapshot().items).toHaveLength(1);
    });

    it('does not re-read once it has loaded', async () => {
      const service = await reload();
      const getItem = jest.spyOn(AsyncStorage, 'getItem');

      await service.start();

      expect(getItem).not.toHaveBeenCalled();
    });

    it('forgets a read decision about a notification that is gone', async () => {
      await plant({
        version: 1,
        completions: [fact()],
        readIds: ['an-id-from-a-notification-that-no-longer-exists'],
        dismissedIds: [],
      });

      const service = await reload();

      // Decisions are only kept for notifications that still exist. A remembered id would keep hiding - or keep
      // marking read - a future arrival that happened to be given the same id.
      expect(service.snapshot().unreadCount).toBe(1);
    });

    it('forgets a dismissal about a notification that is gone', async () => {
      await plant({
        version: 1,
        completions: [fact()],
        readIds: [],
        dismissedIds: ['an-id-from-a-notification-that-no-longer-exists'],
      });

      const service = await reload();

      expect(service.snapshot().items).toHaveLength(1);
    });

    it('keeps a decision about a notification that is still there', async () => {
      const dismissed = syncFileCompletionNotificationId(fact());
      await plant({
        version: 1,
        completions: [fact()],
        readIds: [],
        dismissedIds: [dismissed],
      });

      const service = await reload();

      expect(service.snapshot().items).toEqual([]);
    });

    it('drops an arrival it cannot read and keeps the rest', async () => {
      await plant({
        version: 1,
        completions: [{ syncId: '' }, fact({ deviceId: 'the-ipad' })],
        readIds: [],
        dismissedIds: [],
      });

      const service = await reload();

      // Per record: one unreadable row from an older build must not empty the list and lose every arrival the
      // user has not looked at yet.
      expect(service.snapshot().items).toHaveLength(1);
      expect(service.snapshot().items[0]?.deviceId).toBe('the-ipad');
    });

    it('starts empty when what is stored is not readable', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, '{ truncated by a crash');

      const service = await reload();

      // Empty rather than a throw: the notifications screen shows nothing instead of the app failing to start.
      expect(service.snapshot().items).toEqual([]);
    });

    it('treats missing pieces as empty', async () => {
      await plant({ version: 1 });

      const service = await reload();

      expect(service.snapshot().items).toEqual([]);
    });
  });

  describe('telling the screens', () => {
    it('tells a listener when something arrives', async () => {
      const service = await reload();
      const changes: number[] = [];
      service.onChanged(() => changes.push(1));

      await service.record(fact());

      // The badge and the list are drawn from this: without it a file arrives and nothing on screen moves until
      // the user navigates.
      expect(changes).toEqual([1]);
    });

    it('stops telling a listener that unsubscribed', async () => {
      const service = await reload();
      const changes: number[] = [];
      const unsubscribe = service.onChanged(() => changes.push(1));

      unsubscribe();
      await service.record(fact());

      expect(changes).toEqual([]);
    });
  });

  it('still reports a send that could not be written down', async () => {
    const service = await reload();
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValue(new Error('the disk is full'));

    service.recordSent(file(), { deviceId: 'the-mac', deviceName: 'The Mac' });
    // Long enough for the write to fail and its rejection to be swallowed inside the service.
    await new Promise(resolve => setTimeout(resolve, 50));

    // The fire-and-forget callers swallow the write failure on purpose: the transfer already happened, and an
    // unhandled rejection from a notification would take the app down over bookkeeping. The row is still there.
    expect(service.snapshot().items).toHaveLength(1);
    jest.restoreAllMocks();
  });

  it('still reports an arrival that could not be written down', async () => {
    const service = await reload();
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValue(new Error('the disk is full'));

    service.recordReceived(file(), {
      originDeviceId: 'the-ipad',
      originDeviceName: 'The iPad',
    });
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(service.snapshot().items).toHaveLength(1);
    jest.restoreAllMocks();
  });

  it('carries on writing after a write that failed', async () => {
    const service = await reload();
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('the disk is full'));

    // Whatever the write does, the arrival stands: this is a record of something that already happened, so
    // nothing is rolled back the way a settings toggle would be.
    await service.record(fact()).catch(() => undefined);
    expect(service.snapshot().items).toHaveLength(1);
    jest.restoreAllMocks();
    await service.record(fact({ deviceId: 'the-ipad' }));

    // The queue is serial, so one failure must not poison it - a single full-disk moment would otherwise stop
    // every later arrival from ever being recorded. Read back through storage: both arrivals are there, because
    // the write that succeeded persists the whole set.
    const stored = JSON.parse(
      (await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null',
    );
    expect(stored.completions).toHaveLength(2);
  });
});
