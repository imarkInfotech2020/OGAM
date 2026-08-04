/**
 * The device itself: which native modules this build has, what OS it is running, and what the permission
 * dialog will answer.
 *
 * One owner for all three, because they are one thing - the device a test is pretending to be - and because
 * code that reads them usually reads more than one (a capability, then the OS version that decides which
 * permission to ask for). Anything that stands in for `react-native` should hand these through rather than
 * declare its own.
 *
 * Pinned to the global so the same device survives a module registry reset: a module that caches state in
 * module scope has to be re-required to test its first run, and that re-evaluates this file too.
 */

const GRANTED = 'granted';

interface DeviceState {
  nativeModules: Record<string, unknown>;
  platform: { OS: string; Version: string | number };
  permissions: { outcomes: Record<string, string>; requested: string[][] };
}

const device: DeviceState = ((
  globalThis as { __offgridDeviceBoundary?: DeviceState }
).__offgridDeviceBoundary ??= {
  nativeModules: {},
  platform: { OS: 'android', Version: 33 },
  permissions: { outcomes: {}, requested: [] },
});

export const nativeModules = device.nativeModules;

/** Mutable: the OS and its version decide what is even askable. */
export const platform = device.platform;

export const permissionsAndroid = {
  RESULTS: {
    GRANTED,
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  /** Every set of permissions the code asked for, in order. */
  requested: device.permissions.requested,
  async request(permission: string): Promise<string> {
    device.permissions.requested.push([permission]);
    return device.permissions.outcomes[permission] ?? 'denied';
  },
  async requestMultiple(
    permissions: string[],
  ): Promise<Record<string, string>> {
    device.permissions.requested.push(permissions);
    return Object.fromEntries(
      permissions.map(permission => [
        permission,
        device.permissions.outcomes[permission] ?? 'denied',
      ]),
    );
  },
};

/** What the system dialog will answer for these permissions. */
export function grantPermissions(...permissions: string[]): void {
  for (const permission of permissions) {
    device.permissions.outcomes[permission] = GRANTED;
  }
}

export function denyPermissions(
  outcomes: Record<string, 'denied' | 'never_ask_again'>,
): void {
  Object.assign(device.permissions.outcomes, outcomes);
}

export function resetReactNativeBoundary(): void {
  for (const key of Object.keys(device.nativeModules)) {
    delete device.nativeModules[key];
  }
  device.platform.OS = 'android';
  device.platform.Version = 33;
  for (const key of Object.keys(device.permissions.outcomes)) {
    delete device.permissions.outcomes[key];
  }
  device.permissions.requested.length = 0;
}
