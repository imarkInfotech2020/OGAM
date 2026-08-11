import { NativeEventBus } from '../../utils/nativeEventBus';
import {
  denyPermissions,
  grantPermissions,
  nativeModules,
  permissionsAndroid,
  platform,
  resetReactNativeBoundary,
} from '../../utils/reactNativeBoundary';
import {
  nativeScreenshotBoundary,
  type NativeScreenshot,
} from '../../../src/services/sync/nativeScreenshot';

jest.mock('react-native', () => {
  const { FakeNativeEventEmitter } = require('../../utils/nativeEventBus');
  const device = require('../../utils/reactNativeBoundary');
  return {
    NativeModules: device.nativeModules,
    Platform: device.platform,
    PermissionsAndroid: device.permissionsAndroid,
    NativeEventEmitter: FakeNativeEventEmitter,
  };
});

const CAPTURED_EVENT = 'SyncScreenshotCaptured';

/** The platform's screenshot watcher: it is switched on and off, and it reports what it saw. */
class ScreenshotNativeFake extends NativeEventBus {
  readonly enabled: boolean[] = [];
  permission: boolean | undefined = false;

  setEnabled(enabled: boolean): void {
    this.enabled.push(enabled);
  }

  async hasPermission(): Promise<boolean> {
    return this.permission ?? false;
  }

  addListener(): void {}
  removeListeners(): void {}
}

/**
 * A screenshot going to your other devices the moment you take it.
 *
 * Take a shot on the phone, and it is on the Mac before you have put the phone down. That only works while
 * something is watching, and watching costs battery and needs a permission - so the two things asserted here
 * are that the watcher is switched OFF again when nobody is listening, and that a caller can tell whether
 * observing will actually produce anything before it promises the user that it will.
 */
describe('a screenshot going to your other devices as you take it', () => {
  let watcher: ScreenshotNativeFake;

  const screenshot = (
    overrides: Partial<NativeScreenshot> = {},
  ): NativeScreenshot => ({
    syncId: 'shot-1',
    name: 'IMG_0421.PNG',
    mimeType: 'image/png',
    filePath: '/var/media/IMG_0421.PNG',
    fileSize: 240_000,
    createdAt: '2026-08-04T09:15:30.000Z',
    width: 1179,
    height: 2556,
    ...overrides,
  });

  beforeEach(() => {
    resetReactNativeBoundary();
    watcher = new ScreenshotNativeFake();
  });

  describe('whether this build can watch at all', () => {
    it('can when the platform module is there', () => {
      nativeModules.SyncScreenshotModule = watcher;

      expect(nativeScreenshotBoundary.available()).toBe(true);
    });

    it('cannot when it is not', () => {
      expect(nativeScreenshotBoundary.available()).toBe(false);
    });

    it('does not ask which platform it is running on', () => {
      // The module's presence IS the capability. This used to also require iOS, which is why Android
      // reported "unavailable in this build" after the Android module existed - a platform branch describes
      // the build that was written, not the one that is running.
      nativeModules.SyncScreenshotModule = watcher;
      platform.OS = 'android';
      expect(nativeScreenshotBoundary.available()).toBe(true);

      platform.OS = 'ios';
      expect(nativeScreenshotBoundary.available()).toBe(true);
    });
  });

  describe('getting permission to read them', () => {
    it('needs nothing extra on iOS, where the module asks for itself', async () => {
      platform.OS = 'ios';
      nativeModules.SyncScreenshotModule = watcher;

      // iOS asks for the photo library inside its own module when observation starts, so the answer here is
      // simply whether this build can watch.
      await expect(nativeScreenshotBoundary.authorize()).resolves.toBe(true);
      expect(permissionsAndroid.requested).toEqual([]);
    });

    it('says no on iOS when the build cannot watch', async () => {
      platform.OS = 'ios';

      await expect(nativeScreenshotBoundary.authorize()).resolves.toBe(false);
    });

    it('asks Android for the media permission that makes screenshots readable', async () => {
      nativeModules.SyncScreenshotModule = watcher;
      grantPermissions('android.permission.READ_MEDIA_IMAGES');

      await expect(nativeScreenshotBoundary.authorize()).resolves.toBe(true);
      expect(permissionsAndroid.requested).toEqual([
        ['android.permission.READ_MEDIA_IMAGES'],
      ]);
    });

    it('asks an older Android for the permission it actually has', async () => {
      nativeModules.SyncScreenshotModule = watcher;
      platform.Version = 32;
      grantPermissions('android.permission.READ_EXTERNAL_STORAGE');

      // READ_MEDIA_IMAGES does not exist before 33, so asking for it there grants nothing and the watcher
      // would run seeing nothing.
      expect(await nativeScreenshotBoundary.authorize()).toBe(true);
      expect(permissionsAndroid.requested).toEqual([
        ['android.permission.READ_EXTERNAL_STORAGE'],
      ]);
    });

    it('does not ask again when the permission is already held', async () => {
      nativeModules.SyncScreenshotModule = watcher;
      watcher.permission = true;

      expect(await nativeScreenshotBoundary.authorize()).toBe(true);
      expect(permissionsAndroid.requested).toEqual([]);
    });

    it('says no when the user refuses', async () => {
      nativeModules.SyncScreenshotModule = watcher;
      denyPermissions({
        'android.permission.READ_MEDIA_IMAGES': 'never_ask_again',
      });

      // The caller needs a false here to say why nothing is being shared, instead of silently watching
      // nothing and looking broken.
      expect(await nativeScreenshotBoundary.authorize()).toBe(false);
    });

    it('says no on an Android build with no watcher in it', async () => {
      expect(await nativeScreenshotBoundary.authorize()).toBe(false);
      expect(permissionsAndroid.requested).toEqual([]);
    });

    it('asks for the permission when the module cannot say whether it is held', async () => {
      nativeModules.SyncScreenshotModule = watcher;
      watcher.permission = undefined;
      (watcher as { hasPermission?: unknown }).hasPermission = undefined;
      grantPermissions('android.permission.READ_MEDIA_IMAGES');

      // An older native module may not answer at all. Asking is the safe reading; assuming it is held would
      // start a watcher that sees nothing.
      expect(await nativeScreenshotBoundary.authorize()).toBe(true);
    });
  });

  describe('watching', () => {
    it('hands over each screenshot as it is taken', () => {
      nativeModules.SyncScreenshotModule = watcher;
      const seen: NativeScreenshot[] = [];

      nativeScreenshotBoundary.observe(shot => seen.push(shot));
      watcher.emit(CAPTURED_EVENT, screenshot());

      expect(seen).toEqual([screenshot()]);
      // Switched on only once someone is listening: watching with no listener is battery spent on nothing.
      expect(watcher.enabled).toEqual([true]);
    });

    it('switches the watcher off when nobody is listening any more', () => {
      nativeModules.SyncScreenshotModule = watcher;
      const seen: NativeScreenshot[] = [];
      const stop = nativeScreenshotBoundary.observe(shot => seen.push(shot));

      stop();
      watcher.emit(CAPTURED_EVENT, screenshot());

      // Both halves: the platform is told to stop, and a late event is not delivered. Leaving it on is a
      // battery drain the user cannot see; delivering after stop shares a screenshot taken after they turned
      // sharing off.
      expect(watcher.enabled).toEqual([true, false]);
      expect(seen).toEqual([]);
    });

    it('keeps watching for a second listener when the first stops', () => {
      nativeModules.SyncScreenshotModule = watcher;
      const first: NativeScreenshot[] = [];
      const second: NativeScreenshot[] = [];
      const stopFirst = nativeScreenshotBoundary.observe(shot =>
        first.push(shot),
      );
      nativeScreenshotBoundary.observe(shot => second.push(shot));

      stopFirst();
      watcher.emit(CAPTURED_EVENT, screenshot());

      // The second listener still gets it. Its own subscription is separate, which is what lets a screen and
      // a background service watch independently.
      expect(first).toEqual([]);
      expect(second).toEqual([screenshot()]);
    });

    it('will not pretend to watch on a build that cannot', () => {
      // Loud, because a caller that thought it was watching would promise the user their screenshots are
      // being shared.
      expect(() => nativeScreenshotBoundary.observe(() => {})).toThrow(
        'Automatic screenshot sharing is unavailable.',
      );
    });

    it.each([
      ['nothing at all', undefined],
      ['a bare string', 'IMG_0421.PNG'],
      ['no id', { syncId: undefined }],
      ['an id that is not text', { syncId: 7 }],
      ['no name', { name: undefined }],
      ['no type', { mimeType: undefined }],
      ['no path', { filePath: undefined }],
      ['a size that is not a number', { fileSize: '240000' }],
      ['no time', { createdAt: undefined }],
      ['a width that is not a number', { width: null }],
      ['no height', { height: undefined }],
    ])('ignores a capture reported with %s', (_label, broken) => {
      nativeModules.SyncScreenshotModule = watcher;
      const seen: NativeScreenshot[] = [];
      nativeScreenshotBoundary.observe(shot => seen.push(shot));

      watcher.emit(
        CAPTURED_EVENT,
        typeof broken === 'object' && broken !== null
          ? { ...screenshot(), ...broken }
          : broken,
      );

      // A half-described screenshot cannot be transferred - there is nothing to read or no size to expect -
      // so it is dropped rather than queued as a transfer that can only fail. And it must not throw inside a
      // native callback.
      expect(seen).toEqual([]);
    });

    it('passes on the size the transfer will be checked against', () => {
      nativeModules.SyncScreenshotModule = watcher;
      const seen: NativeScreenshot[] = [];
      nativeScreenshotBoundary.observe(shot => seen.push(shot));

      watcher.emit(CAPTURED_EVENT, screenshot({ fileSize: 0 }));

      // Zero is a real answer from the media store on a shot still being written, and it has to reach the
      // caller so the caller decides - not be dropped here as if it were malformed.
      expect(seen[0].fileSize).toBe(0);
    });
  });
});
