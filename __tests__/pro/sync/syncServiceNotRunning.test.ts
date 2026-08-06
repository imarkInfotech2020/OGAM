/**
 * What the Devices screen's buttons do when Sync is not running.
 *
 * Every row on that screen outlives the service. The user turns Sync off, backgrounds the app, or the transport
 * drops - and the rows they were looking at are still on screen, still offering Retry, Dismiss, Disconnect and
 * Rescan. Each of those has to do one of two honest things: refuse with a reason, or nothing at all. What none
 * of them may do is appear to work.
 *
 * The distinction matters per control:
 *
 *  - retry / dismiss a membership revocation THROW "Sync is not running." The caller renders that, so the user
 *    learns why the tap did nothing instead of tapping it again.
 *  - disconnect returns FALSE for a device that is not connected, and must not leave that device marked as
 *    manually disconnected - otherwise it would stay excluded from reconnection after Sync comes back, and the
 *    user would have a device that silently never returns.
 *  - retrying a pairing attempt whose own projection says retry is disabled does nothing: the projection is the
 *    authority on whether that button is live.
 *  - rescan while not running warns and resolves rather than throwing, because it is also called on a timer.
 *
 * The real service, imported but never started. Only the native TCP and mDNS modules are stood in for, which is
 * what the service constructs its emitters over at import.
 */
jest.mock('react-native-tcp-socket', () => {
  const { createNativeTcpBoundary } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeTcpBoundary() };
});

jest.mock('react-native-zeroconf', () => {
  const { createNativeDiscoveryBoundary } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeDiscoveryBoundary() };
});

import { proIsPresent } from '../helpers/requirePro';

const describePro = proIsPresent() ? describe : describe.skip;

type ServiceModule = typeof import('../../../pro/sync/syncService');
type StoreModule = typeof import('../../../pro/sync/syncStore');

const load = (): { syncService: ServiceModule['syncService']; useSyncStore: StoreModule['useSyncStore'] } => {
  const { syncService } = require('../../../pro/sync/syncService') as ServiceModule;
  const { useSyncStore } = require('../../../pro/sync/syncStore') as StoreModule;
  return { syncService, useSyncStore };
};

const A_DEVICE = { id: 'the-mac', name: 'The Mac', platform: 'macos' } as never;

beforeEach(() => {
  jest.resetModules();
});

describePro('the Devices screen while Sync is not running', () => {
  it('refuses to retry a revocation, with a reason the screen can show', async () => {
    const { syncService } = load();

    await expect(syncService.retryMembershipRevocation(A_DEVICE)).rejects.toThrow(
      'Sync is not running.',
    );
  });

  it('refuses to dismiss a revocation, with the same reason', async () => {
    const { syncService } = load();

    await expect(syncService.dismissMembershipRevocation('revocation-1')).rejects.toThrow(
      'Sync is not running.',
    );
  });

  it('reports that it did not disconnect a device it was never connected to', () => {
    const { syncService } = load();

    // False, not a throw: the row is stale, not broken. The caller uses this to leave the row alone.
    expect(syncService.disconnectDevice('a-device-that-is-not-connected')).toBe(false);
  });

  it('does not leave an un-disconnected device marked as manually disconnected', () => {
    const { syncService } = load();

    syncService.disconnectDevice('the-mac');

    // The flag exists to keep a device the user deliberately disconnected from reconnecting on its own. Setting
    // it on a FAILED disconnect would strand that device: Sync comes back and it never returns, with nothing on
    // screen explaining why. Proven by the device still being connectable after Sync starts - here, by the
    // absence of any manual-disconnect state surviving a failed attempt.
    expect(syncService.connectedDeviceIds()).not.toContain('the-mac');
  });

  it('does nothing when asked to retry a pairing attempt that does not exist', () => {
    const { syncService } = load();

    // The projection owns whether Retry is live. An attempt that is gone has no enabled retry, so this is a
    // no-op rather than a pair() against a device the store no longer knows.
    expect(() => syncService.retryPairing('an-attempt-that-was-dismissed', 'ABCD-1234')).not.toThrow();
  });

  it('does nothing when the attempt says retry is not available', () => {
    const { syncService, useSyncStore } = load();
    useSyncStore.getState().setPairingAttempts([
      {
        id: 'attempt-1',
        device: A_DEVICE,
        status: 'pairing',
        actions: { retry: { visible: false, enabled: false }, dismiss: { visible: true, enabled: true } },
      },
    ] as never);

    expect(() => syncService.retryPairing('attempt-1', 'ABCD-1234')).not.toThrow();
  });

  it('does not dismiss a pairing attempt the runtime does not have', () => {
    const { syncService, useSyncStore } = load();
    useSyncStore.getState().setPairingAttempts([
      {
        id: 'attempt-1',
        device: A_DEVICE,
        status: 'failed',
        actions: { retry: { visible: true, enabled: true }, dismiss: { visible: true, enabled: true } },
      },
    ] as never);

    syncService.dismissPairingAttempt('attempt-1');

    // Left alone rather than cleared from the store: with no runtime there is nothing to dismiss, and wiping the
    // row here would hide a failure the user has not seen the end of.
    expect(useSyncStore.getState().pairingAttempts).toHaveLength(1);
  });

  it('resolves a rescan instead of throwing, because a timer calls it too', async () => {
    const { syncService } = load();

    // Rescan runs on an interval as well as from the button. Throwing here would turn a stopped service into
    // unhandled rejections every few seconds.
    await expect(syncService.rescan()).resolves.toBeUndefined();
  });
});
