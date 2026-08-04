import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import {
  clearLegacyLocalDeviceId,
  getLocalDeviceProfile,
  readLegacyLocalDeviceId,
  renameLocalDevice,
} from '../../../src/services/sync/localDevice';

// The platform tag comes from the sync service, which reaches the TCP module at import time. Stood in so
// this suite can run off a device; nothing in it depends on a socket.
jest.mock('react-native-tcp-socket', () => {
  const {
    createNativeTcpBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeTcpBoundary() };
});

const DEVICE_NAME_KEY = '@offgrid/sync/deviceName';
const LEGACY_DEVICE_ID_KEY = '@offgrid/sync/deviceId';

/**
 * What this device calls itself - and, just as importantly, what it does NOT decide.
 *
 * The name is the only thing the user sees of a device in someone else's Devices list, so it is worth
 * getting right: the phone's own name if the OS will give it, a plain default if it will not, and never
 * blank.
 *
 * The identity is the part that has to stay absent. The canonical installation id is the protected
 * fingerprint, attached in exactly one place. Minting one here would create a second identity source -
 * records and version vectors keyed to a random id while membership, pairing and the licensed roster are
 * keyed to the fingerprint - so the same physical device would appear twice and its history would be
 * attributed to a device in no roster. That is why the profile is asserted to carry no id at all, and why
 * the legacy id can only be read and cleared, never written.
 */
describe('what this device calls itself', () => {
  const named = (deviceName: string | (() => string)) => {
    (
      DeviceInfo as unknown as { getDeviceNameSync: () => string }
    ).getDeviceNameSync =
      typeof deviceName === 'function' ? deviceName : () => deviceName;
  };

  beforeEach(async () => {
    await AsyncStorage.removeItem(DEVICE_NAME_KEY);
    await AsyncStorage.removeItem(LEGACY_DEVICE_ID_KEY);
    named("Mac's iPhone");
  });

  describe('the profile it advertises', () => {
    it('carries no identity of its own', async () => {
      const profile = await getLocalDeviceProfile();

      // Not undefined - absent. One owner for installation identity, or the same phone shows up twice in a
      // licensed roster and its records belong to neither copy.
      expect('id' in profile).toBe(false);
      expect(Object.keys(profile).sort()).toEqual([
        'host',
        'name',
        'platform',
        'port',
        'version',
      ]);
    });

    it('uses the name the phone already has', async () => {
      const profile = await getLocalDeviceProfile();

      // The user recognises their own device by the name the OS shows them; anything else reads as an
      // unfamiliar device asking to pair.
      expect(profile.name).toBe("Mac's iPhone");
    });

    it('prefers the name the user chose over the phone name', async () => {
      await renameLocalDevice('Work phone');

      expect((await getLocalDeviceProfile()).name).toBe('Work phone');
    });

    it('falls back to a plain name when the OS will not say', async () => {
      named(() => {
        throw new Error('permission denied');
      });

      // Best-effort: on Android the device name needs a permission that may not be held, and a device with
      // no name at all is unpickable in a list.
      expect((await getLocalDeviceProfile()).name).toBe('Off Grid AI Device');
    });

    it('falls back when the OS answers with nothing', async () => {
      named('');

      expect((await getLocalDeviceProfile()).name).toBe('Off Grid AI Device');
    });

    it('advertises no address, because the transport supplies it', async () => {
      const profile = await getLocalDeviceProfile();

      // Discovery fills these in per route; a hardcoded address here would have a peer dial the wrong one.
      expect(profile).toMatchObject({ host: '', port: 0, version: '1' });
      expect(['ios', 'android']).toContain(profile.platform);
    });
  });

  describe('renaming it', () => {
    it('remembers the new name across a relaunch', async () => {
      await renameLocalDevice('Kitchen iPad');

      // Read back through storage rather than from the return value: the name has to survive the app closing,
      // or every peer sees it change back.
      expect(await AsyncStorage.getItem(DEVICE_NAME_KEY)).toBe('Kitchen iPad');
      expect((await getLocalDeviceProfile()).name).toBe('Kitchen iPad');
    });

    it('trims what was typed', async () => {
      expect(await renameLocalDevice('  Kitchen iPad  ')).toBe('Kitchen iPad');
      expect(await AsyncStorage.getItem(DEVICE_NAME_KEY)).toBe('Kitchen iPad');
    });

    it.each([
      ['nothing', ''],
      ['only spaces', '   '],
    ])('refuses %s, and keeps the old name', async (_label, typed) => {
      await renameLocalDevice('Kitchen iPad');

      await expect(renameLocalDevice(typed)).rejects.toThrow(
        'Enter a device name.',
      );

      // Unchanged: a rejected rename must not leave the device nameless in every other device's list.
      expect(await AsyncStorage.getItem(DEVICE_NAME_KEY)).toBe('Kitchen iPad');
    });

    it('refuses a name too long to show, and says the limit', async () => {
      await expect(renameLocalDevice('x'.repeat(65))).rejects.toThrow(
        'Device names can be up to 64 characters.',
      );
    });

    it('accepts a name of exactly the limit', async () => {
      const longest = 'x'.repeat(64);

      // The message promises 64, so 64 has to work - an off-by-one here contradicts the error the user was
      // just shown.
      expect(await renameLocalDevice(longest)).toBe(longest);
    });

    it('measures the length after trimming', async () => {
      const padded = `  ${'x'.repeat(64)}  `;

      // The spaces are not part of the name, so they must not count against a limit that exists to keep the
      // name displayable.
      expect(await renameLocalDevice(padded)).toHaveLength(64);
    });
  });

  describe('the random id older builds minted', () => {
    it('is nothing on an install that never had one', async () => {
      await expect(readLegacyLocalDeviceId()).resolves.toBeNull();
    });

    it('never creates one by being asked for it', async () => {
      await readLegacyLocalDeviceId();

      // The whole point: reading must not mint. A written id here would be a second identity source on every
      // fresh install.
      expect(await AsyncStorage.getItem(LEGACY_DEVICE_ID_KEY)).toBeNull();
    });

    it('is handed over so an old op-log can be re-attributed once', async () => {
      await AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, 'legacy-install-7');

      expect(await readLegacyLocalDeviceId()).toBe('legacy-install-7');
    });

    it('is trimmed, the way it may have been stored', async () => {
      await AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, '  legacy-install-7\n');

      // It is about to be compared against every row's deviceId, so a stray newline would match nothing and
      // the migration would silently do nothing.
      expect(await readLegacyLocalDeviceId()).toBe('legacy-install-7');
    });

    it.each([
      ['blank', ''],
      ['only whitespace', '   '],
    ])('is nothing when what was stored is %s', async (_label, stored) => {
      await AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, stored);

      // Null, not an empty string: an empty id would be re-attributed onto every op whose device is unknown.
      expect(await readLegacyLocalDeviceId()).toBeNull();
    });

    it('is retired once its rows carry the canonical identity', async () => {
      await AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, 'legacy-install-7');

      await clearLegacyLocalDeviceId();

      // Cleared so the migration runs once. Leaving it would re-run on every launch against a log that no
      // longer mentions it.
      expect(await readLegacyLocalDeviceId()).toBeNull();
    });

    it('is safe to retire when there was never one', async () => {
      await expect(clearLegacyLocalDeviceId()).resolves.toBeUndefined();
    });
  });
});
