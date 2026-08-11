import {
  DirectorySourceFake,
  DownloadsFake,
  denyPermissions,
  grantPermissions,
  nativeModules,
  permissionsAndroid,
  picker,
  platform,
  resetDirectoryAccessBoundary,
} from '../../utils/directoryAccessBoundary';
import type { nativeDirectorySourceBoundary as Boundary } from '../../../src/services/sync/nativeDirectorySource';

jest.mock('react-native', () => {
  const boundary = require('../../utils/directoryAccessBoundary');
  return {
    NativeModules: boundary.nativeModules,
    Platform: boundary.platform,
    PermissionsAndroid: boundary.permissionsAndroid,
  };
});

jest.mock('@react-native-documents/picker', () => {
  const boundary = require('../../utils/directoryAccessBoundary');
  return {
    pickDirectory: boundary.picker.pickDirectory,
    isErrorWithCode: boundary.picker.isErrorWithCode,
    errorCodes: boundary.picker.errorCodes,
  };
});

/**
 * Sharing a folder, on the platform that will not let you share one.
 *
 * Android 11 stopped granting the Downloads directory to a picker at all - it answers "For your safety, share
 * another folder" - so the folder is read through MediaStore behind a media permission instead. Everywhere
 * else the user picks a folder and the grant is a folder grant.
 *
 * Two things must hold, and both are about not lying to the user. The button never promises a picker that
 * will not appear, and the card never claims to share a whole folder while the system is only showing us the
 * pictures in it. The sentinel grant is the mechanism: the shared engine treats a grant as an opaque string,
 * so it travels through unchanged and no rule above has to know which road was taken.
 */
describe('sharing a folder with your other devices', () => {
  /**
   * A fresh copy of the module for each test: the access it holds is remembered in module state, because the
   * words on screen are chosen while rendering and cannot wait for a native call.
   */
  const load = (): typeof Boundary => {
    let loaded: typeof Boundary | undefined;
    jest.isolateModules(() => {
      loaded =
        require('../../../src/services/sync/nativeDirectorySource').nativeDirectorySourceBoundary;
    });
    if (!loaded) throw new Error('the boundary did not load');
    return loaded;
  };

  const MEDIA_STORE_GRANT = 'mediastore:downloads';

  let downloads: DownloadsFake;
  let folders: DirectorySourceFake;

  beforeEach(() => {
    resetDirectoryAccessBoundary();
    downloads = new DownloadsFake();
    folders = new DirectorySourceFake();
  });

  describe('whether this device can share a folder at all', () => {
    it('can when it has a folder picker', () => {
      nativeModules.SyncDirectorySourceModule = folders;

      expect(load().available()).toBe(true);
    });

    it('can when all it has is the Downloads reader', () => {
      nativeModules.SyncDownloadsModule = downloads;

      // Android with no folder module still shares Downloads. Reporting false here would hide the feature on
      // the platform it was built for.
      expect(load().available()).toBe(true);
    });

    it('cannot when the build has neither', () => {
      expect(load().available()).toBe(false);
    });
  });

  describe('what the Downloads card says', () => {
    it('says nothing on a platform where a folder can just be picked', () => {
      platform.OS = 'ios';
      nativeModules.SyncDownloadsModule = downloads;

      // undefined means "use the shared folder-grant wording": this override exists only for Android's
      // refusal, and leaking it to iOS would explain a limitation that platform does not have.
      expect(load().access()).toBeUndefined();
    });

    it('says nothing on an Android build without the Downloads reader', () => {
      platform.OS = 'android';

      expect(load().access()).toBeUndefined();
    });

    it('asks for media access before anything has been granted', () => {
      nativeModules.SyncDownloadsModule = downloads;

      const copy = load().access();

      // The button says what will actually happen next - a permission dialog, not a folder picker.
      expect(copy?.configureLabel).toBe('Allow media access');
      expect(copy?.description).toContain(
        'Android does not let apps pick this folder',
      );
      // And it says plainly what will be missing, rather than letting the user discover it when a PDF never
      // arrives.
      expect(copy?.limitation).toContain('pictures and video');
      expect(copy?.upgrade).toEqual({ label: 'Allow all files' });
    });

    it('offers to start watching once media access is granted, and still names the limit', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      downloads.state = {
        media: true,
        allFiles: false,
        canRequestAllFiles: true,
      };
      const boundary = load();

      await boundary.refreshAccess();

      const copy = boundary.access();
      expect(copy?.configureLabel).toBe('Start watching');
      // Media granted is not all files granted: the card must keep saying so while a PDF still cannot be seen.
      expect(copy?.limitation).toContain('all files access');
      expect(copy?.upgrade).toEqual({ label: 'Allow all files' });
    });

    it('drops the limitation once the device can see every file', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      downloads.state = {
        media: true,
        allFiles: true,
        canRequestAllFiles: true,
      };
      const boundary = load();

      await boundary.refreshAccess();

      const copy = boundary.access();
      expect(copy?.configureLabel).toBe('Start watching');
      expect(copy?.description).toContain('New files saved to your Downloads');
      // Nothing left to warn about and nothing left to upgrade to.
      expect(copy?.limitation).toBeUndefined();
      expect(copy?.upgrade).toBeUndefined();
    });

    it('does not offer an upgrade the device will not allow', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      downloads.state = {
        media: true,
        allFiles: false,
        canRequestAllFiles: false,
      };
      const boundary = load();

      await boundary.refreshAccess();

      // A button that opens nothing is worse than no button. Some devices refuse all-files access outright.
      expect(boundary.access()?.upgrade).toBeUndefined();
      expect(boundary.access()?.limitation).toBeDefined();
    });

    it('keeps the wording it had when the device cannot say what access it holds', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      downloads.state = {
        media: true,
        allFiles: true,
        canRequestAllFiles: true,
      };
      const boundary = load();
      await boundary.refreshAccess();
      downloads.accessStateFailure = new Error('the module is not ready');

      await expect(boundary.refreshAccess()).resolves.toBeUndefined();

      // An unreadable access state is not a failure of the folder - the card simply stays as it was rather
      // than reverting to asking for a permission the user already gave.
      expect(boundary.access()?.limitation).toBeUndefined();
    });

    it('refreshes nothing on a build with no Downloads reader', async () => {
      await expect(load().refreshAccess()).resolves.toBeUndefined();
    });
  });

  describe('asking for all-files access', () => {
    it('asks the system and then says what changed', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      downloads.state = {
        media: true,
        allFiles: false,
        canRequestAllFiles: true,
      };
      const boundary = load();
      await boundary.refreshAccess();
      expect(boundary.access()?.limitation).toBeDefined();

      await boundary.upgrade();

      // The card has to catch up in the same breath: the user came back from a system settings screen and
      // expects the app to know what they did there.
      expect(downloads.calls).toContain('requestAllFilesAccess');
      expect(boundary.access()?.limitation).toBeUndefined();
    });

    it('keeps the limitation when the user says no', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      downloads.state = {
        media: true,
        allFiles: false,
        canRequestAllFiles: true,
      };
      downloads.allFilesOutcome = false;
      const boundary = load();
      await boundary.refreshAccess();

      await boundary.upgrade();

      expect(boundary.access()?.limitation).toBeDefined();
    });

    it('does nothing on a build that cannot ask', async () => {
      await expect(load().upgrade()).resolves.toBeUndefined();
    });
  });

  describe('getting permission to read the folder', () => {
    it('takes the media permission Android will actually grant', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      grantPermissions(
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
      );

      const grant = await load().authorize();

      expect(grant).toBe(MEDIA_STORE_GRANT);
      expect(permissionsAndroid.requested).toEqual([
        [
          'android.permission.READ_MEDIA_IMAGES',
          'android.permission.READ_MEDIA_VIDEO',
        ],
      ]);
      // No picker was opened: on this platform it would only answer "share another folder".
      expect(picker.calls).toEqual([]);
    });

    it('asks for the older storage permission on an older Android', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      platform.Version = 32;
      grantPermissions('android.permission.READ_EXTERNAL_STORAGE');

      const grant = await load().authorize();

      // The granular media permissions do not exist before 33, so asking for them there grants nothing at
      // all and the folder silently stays empty.
      expect(permissionsAndroid.requested).toEqual([
        ['android.permission.READ_EXTERNAL_STORAGE'],
      ]);
      expect(grant).toBe(MEDIA_STORE_GRANT);
    });

    it('shares pictures when only pictures were allowed', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      grantPermissions('android.permission.READ_MEDIA_IMAGES');
      denyPermissions({ 'android.permission.READ_MEDIA_VIDEO': 'denied' });

      // Either one is enough to see something. Refusing the whole folder because video was denied would give
      // the user nothing for the permission they did grant.
      expect(await load().authorize()).toBe(MEDIA_STORE_GRANT);
    });

    it('does not ask again when permission is already held', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      downloads.granted = true;

      expect(await load().authorize()).toBe(MEDIA_STORE_GRANT);
      expect(permissionsAndroid.requested).toEqual([]);
    });

    it('comes back empty when the user refuses', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      denyPermissions({
        'android.permission.READ_MEDIA_IMAGES': 'never_ask_again',
        'android.permission.READ_MEDIA_VIDEO': 'denied',
      });

      // Empty, not an error: refusing a permission is a choice, and the sheet closes rather than showing a
      // failure the user caused on purpose.
      expect(await load().authorize()).toBeUndefined();
    });

    it('learns what access it ended up with', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      downloads.granted = true;
      downloads.state = {
        media: true,
        allFiles: false,
        canRequestAllFiles: true,
      };
      const boundary = load();

      await boundary.authorize();

      // The card is drawn immediately after this returns, so the state has to be known by then.
      expect(boundary.access()?.configureLabel).toBe('Start watching');
    });

    it('opens the folder picker on a platform that has one', async () => {
      platform.OS = 'android';
      nativeModules.SyncDirectorySourceModule = folders;
      picker.answers({ uri: 'content://tree/primary%3ADocuments' });

      const grant = await load().authorize();

      expect(grant).toBe('content://tree/primary%3ADocuments');
      // Long-term access, or the grant stops working the next time the app launches.
      expect(picker.calls).toEqual([{ requestLongTermAccess: true }]);
    });

    it('keeps the bookmark rather than the path on iOS', async () => {
      platform.OS = 'ios';
      nativeModules.SyncDirectorySourceModule = folders;
      picker.answers({
        uri: 'file:///private/var/mobile/Documents',
        bookmarkStatus: 'success',
        bookmark: 'a-security-scoped-bookmark',
      });

      // iOS folder access survives a relaunch only through the bookmark; the path alone is unreadable next
      // launch, which reads as a folder that silently stopped syncing.
      expect(await load().authorize()).toBe('a-security-scoped-bookmark');
    });

    it('says why when iOS would not keep the folder', async () => {
      platform.OS = 'ios';
      nativeModules.SyncDirectorySourceModule = folders;
      picker.answers({
        uri: 'file:///private/var/mobile/Documents',
        bookmarkStatus: 'error',
        bookmarkError: 'the folder could not be bookmarked',
      });

      // Loud, because a folder saved without a usable bookmark looks fine today and is broken tomorrow.
      await expect(load().authorize()).rejects.toThrow(
        'the folder could not be bookmarked',
      );
    });

    it('comes back empty when the user closes the picker', async () => {
      nativeModules.SyncDirectorySourceModule = folders;
      picker.fails({ code: 'OPERATION_CANCELED' });

      expect(await load().authorize()).toBeUndefined();
    });

    it('reports a picker that genuinely failed', async () => {
      nativeModules.SyncDirectorySourceModule = folders;
      picker.fails({ code: 'UNABLE_TO_OPEN_FILE_TYPE' });

      // Distinct from a cancel: something went wrong, and silently returning nothing would leave the user
      // tapping a button that appears to do nothing.
      await expect(load().authorize()).rejects.toEqual({
        code: 'UNABLE_TO_OPEN_FILE_TYPE',
      });
    });

    it('reports a failure that carries no code at all', async () => {
      nativeModules.SyncDirectorySourceModule = folders;
      picker.fails(new Error('the picker crashed'));

      await expect(load().authorize()).rejects.toThrow('the picker crashed');
    });
  });

  describe('reading what is in the folder', () => {
    const candidate = {
      sourceId: 'media:41',
      name: 'invoice.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      createdAt: '2026-08-01T10:00:00.000Z',
      modifiedAt: 1_700_000_000_000,
    };

    it('reads Downloads through the media reader', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      nativeModules.SyncDirectorySourceModule = folders;
      downloads.candidates = [candidate];

      expect(await load().enumerate(MEDIA_STORE_GRANT)).toEqual([candidate]);
      // Not through the folder module, which holds no grant for this folder and never will.
      expect(folders.enumerated).toEqual([]);
    });

    it('reads a picked folder through the folder module', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      nativeModules.SyncDirectorySourceModule = folders;
      folders.candidates = [candidate];

      expect(
        await load().enumerate('content://tree/primary%3ADocuments'),
      ).toEqual([candidate]);
      expect(folders.enumerated).toEqual([
        'content://tree/primary%3ADocuments',
      ]);
      expect(downloads.calls).not.toContain('enumerate');
    });

    it('reads a picked folder even on a build that also has the media reader', async () => {
      nativeModules.SyncDirectorySourceModule = folders;
      nativeModules.SyncDownloadsModule = downloads;

      await load().enumerate('content://tree/other');

      expect(folders.enumerated).toEqual(['content://tree/other']);
    });

    it('says folder sharing is unavailable when there is no folder module', () => {
      // Thrown as the call is made rather than as the promise settles. Every caller awaits it from inside an
      // async function, so it still reaches them as a rejection - but a caller that only attached .catch()
      // would not see it, so the shape is pinned.
      expect(() => load().enumerate('content://tree/other')).toThrow(
        'Folder sharing is unavailable on this device.',
      );
    });

    it('falls back to the folder module for the sentinel when there is no media reader', async () => {
      nativeModules.SyncDirectorySourceModule = folders;

      await load().enumerate(MEDIA_STORE_GRANT);

      // The grant is opaque to the engine above, so a build without the reader must still do something
      // sensible with it rather than crash.
      expect(folders.enumerated).toEqual([MEDIA_STORE_GRANT]);
    });
  });

  describe('taking a copy of a file to send', () => {
    it('stages from Downloads through the media reader', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      nativeModules.SyncDirectorySourceModule = folders;

      const staged = await load().stage(
        MEDIA_STORE_GRANT,
        'media:41',
        'invoice.pdf',
      );

      expect(staged).toEqual({
        filePath: '/docs/staged/invoice.pdf',
        name: 'invoice.pdf',
      });
      expect(downloads.staged).toEqual([['media:41', 'invoice.pdf']]);
      expect(folders.staged).toEqual([]);
    });

    it('stages from a picked folder through the folder module, with its grant', async () => {
      nativeModules.SyncDownloadsModule = downloads;
      nativeModules.SyncDirectorySourceModule = folders;

      await load().stage('content://tree/docs', 'doc:9', 'notes.txt');

      // The grant travels with the call: without it the platform has no authority to read the file.
      expect(folders.staged).toEqual([
        ['content://tree/docs', 'doc:9', 'notes.txt'],
      ]);
      expect(downloads.staged).toEqual([]);
    });

    it('says folder sharing is unavailable when nothing can stage', () => {
      expect(() =>
        load().stage('content://tree/docs', 'doc:9', 'notes.txt'),
      ).toThrow('Folder sharing is unavailable on this device.');
    });

    it('stages the sentinel through the folder module when there is no media reader', async () => {
      nativeModules.SyncDirectorySourceModule = folders;

      await load().stage(MEDIA_STORE_GRANT, 'media:41', 'invoice.pdf');

      expect(folders.staged).toEqual([
        [MEDIA_STORE_GRANT, 'media:41', 'invoice.pdf'],
      ]);
    });
  });
});
