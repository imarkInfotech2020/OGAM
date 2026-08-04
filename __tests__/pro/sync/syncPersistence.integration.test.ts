import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import TcpSocket from 'react-native-tcp-socket';
import type { DeviceInfo } from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import { buildSyncEngine } from '../../../src/services/sync/engine';
import { syncService } from '../../../pro/sync/syncService';
import { useSyncStore } from '../../../pro/sync/syncStore';
import {
  getDiscoveryBoundaries,
  resetDiscoveryBoundaries,
} from '../../utils/nativeSyncBoundaries';
import { MembershipPersistenceBoundary } from '../../utils/membershipPersistenceBoundary';
import { createLicensedMesh } from '../../harness/licensedMesh';

jest.mock('react-native-tcp-socket', () => {
  const {
    createNativeTcpBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeTcpBoundary() };
});

const nativeTcpBoundary = TcpSocket as unknown as RnTcpModule;

jest.mock('react-native-zeroconf', () => {
  const {
    createNativeDiscoveryBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeDiscoveryBoundary() };
});

const waitFor = async (
  condition: () => boolean,
  timeoutMs = 3000,
  label = 'Sync state',
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

/**
 * The pairing code this phone is showing. A peer proves it is the device the user is looking at by
 * presenting this code, which is why nothing has to be accepted afterwards.
 */
function phonePairingCode(): string {
  const code = useSyncStore.getState().pairingCode.code;
  if (!code) throw new Error('the phone has not issued a pairing code yet');
  return code;
}

/** Two devices that can pair: an in-memory licence provider, and a licensed peer to pair with. */
const mesh = createLicensedMesh();

describe('Pro Sync app-lifetime pairing persistence', () => {
  let persistedPairings: string | undefined;

  beforeEach(async () => {
    mesh.reset();
    await syncService.stop();
    await AsyncStorage.clear();
    useSyncStore.getState().reset();
    resetDiscoveryBoundaries();
    persistedPairings = undefined;
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      async ({ service }: { service: string }) =>
        service === 'off-grid-sync-pairings' && persistedPairings
          ? { username: 'sync-pairings', password: persistedPairings }
          : false,
    );
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      async (
        _username: string,
        password: string,
        options: { service: string },
      ) => {
        if (options.service === 'off-grid-sync-pairings')
          persistedPairings = password;
        return true;
      },
    );
  });

  afterEach(async () => {
    mesh.restore();
    await syncService.stop();
  });

  it('silently reconnects a paired device after the mobile Sync service restarts', async () => {
    const remotePersistence = new MembershipPersistenceBoundary();
    const remoteDevice: DeviceInfo = {
      id: 'desktop-peer',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    const remote = buildSyncEngine({
      pairingEntitlement: mesh.peer(),
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      getSharedSecret: deviceId =>
        remotePersistence.getActive(deviceId)?.sharedSecret,
      pairingPersistence: remotePersistence,
      membershipPersistence: remotePersistence,
    });
    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;

    await syncService.start();
    const mobile = useSyncStore.getState().thisDevice;
    const firstDiscovery = getDiscoveryBoundaries().at(-1);
    expect(mobile).toBeDefined();
    expect(firstDiscovery?.publishedPort).toBeGreaterThan(0);

    const firstPairing = remote.engine.pair(
      { ...mobile!, host: '127.0.0.1', port: firstDiscovery!.publishedPort! },
      phonePairingCode(),
    );
    await waitFor(
      () =>
        useSyncStore
          .getState()
          .pairingAttempts.some(
            attempt =>
              attempt.device.id === remoteDevice.id &&
              attempt.direction === 'incoming' &&
              attempt.stage === 'waiting_for_confirmation',
          ),
      3000,
      'initial incoming pairing',
    );
    await firstPairing;
    await waitFor(
      () =>
        useSyncStore
          .getState()
          .knownDevices.some(
            device =>
              device.id === remoteDevice.id && device.status === 'connected',
          ),
      3000,
      'initial connected device',
    );
    await waitFor(() => Boolean(persistedPairings));

    await syncService.stop();
    expect(useSyncStore.getState().status).toBe('idle');

    await syncService.start();
    const discovery = getDiscoveryBoundaries().at(-1);
    expect(discovery).toBeDefined();
    // Announce the peer only once this boundary is actually browsing. A resolve that arrives before the
    // service has registered its listener is dropped on the floor, exactly as a real one would be, and
    // the reconnect then never happens for a reason that has nothing to do with the code under test.
    await waitFor(
      () => discovery!.scanCount > 0,
      3000,
      'discovery to start browsing',
    );
    discovery!.resolve(remoteDevice);

    await waitFor(
      () =>
        useSyncStore
          .getState()
          .knownDevices.some(
            device =>
              device.id === remoteDevice.id && device.status === 'connected',
          ),
      3000,
      'reconnected device',
    );
    expect(useSyncStore.getState().discovered).toHaveLength(0);

    await remote.engine.stop();
  });

  it('repairs one-sided trust and forgets the device locally and remotely', async () => {
    const remotePersistence = new MembershipPersistenceBoundary();
    const remoteDevice: DeviceInfo = {
      id: 'desktop-peer',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    let remote = buildSyncEngine({
      pairingEntitlement: mesh.peer(),
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      getSharedSecret: deviceId =>
        remotePersistence.getActive(deviceId)?.sharedSecret,
      pairingPersistence: remotePersistence,
      membershipPersistence: remotePersistence,
    });
    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;

    await syncService.start();
    const mobile = useSyncStore.getState().thisDevice;
    const firstDiscovery = getDiscoveryBoundaries().at(-1);
    if (!mobile || !firstDiscovery?.publishedPort) {
      throw new Error('Sync did not publish the mobile device');
    }

    const secondPairing = remote.engine.pair(
      { ...mobile, host: '127.0.0.1', port: firstDiscovery.publishedPort },
      phonePairingCode(),
    );
    await waitFor(() =>
      useSyncStore
        .getState()
        .pairingAttempts.some(
          attempt =>
            attempt.device.id === remoteDevice.id &&
            attempt.direction === 'incoming' &&
            attempt.stage === 'waiting_for_confirmation',
        ),
    );
    await secondPairing;
    await waitFor(() =>
      useSyncStore
        .getState()
        .knownDevices.some(
          device =>
            device.id === remoteDevice.id && device.status === 'connected',
        ),
    );

    await remote.engine.stop();
    await waitFor(
      () =>
        useSyncStore
          .getState()
          .knownDevices.find(device => device.id === remoteDevice.id)
          ?.status === 'offline',
      3000,
      'disconnect before repair',
    );
    remotePersistence.dropActive(mobile.id);
    remote = buildSyncEngine({
      pairingEntitlement: mesh.peer(),
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      getPassphrase: () => 'blue-otter-42',
      getSharedSecret: deviceId =>
        remotePersistence.getActive(deviceId)?.sharedSecret,
      pairingPersistence: remotePersistence,
      membershipPersistence: remotePersistence,
    });
    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;

    getDiscoveryBoundaries().at(-1)!.resolve(remoteDevice);
    await waitFor(
      () =>
        useSyncStore
          .getState()
          .knownDevices.find(device => device.id === remoteDevice.id)
          ?.status === 'needs_repair',
      3000,
      'one-sided trust repair state',
    );

    await syncService.pair(remoteDevice, 'blue-otter-42');
    await waitFor(
      () =>
        useSyncStore
          .getState()
          .knownDevices.find(device => device.id === remoteDevice.id)
          ?.status === 'connected',
      3000,
      'repaired connection',
    );
    expect(remotePersistence.getActive(mobile.id)?.sharedSecret).toBeTruthy();

    await syncService.forgetDevice(remoteDevice.id);
    await waitFor(
      () => remotePersistence.getActive(mobile.id) === undefined,
      3000,
      'remote membership revocation',
    );
    expect(useSyncStore.getState().knownDevices).toEqual([]);
    expect(JSON.parse(persistedPairings ?? '{}')).toEqual(
      expect.objectContaining({
        version: 4,
        pairings: {},
        stagedPairings: {},
        pendingRevocations: {},
      }),
    );

    await remote.engine.stop();
  });

  it('keeps an offline eviction pending across restart and completes it on rediscovery', async () => {
    const remotePersistence = new MembershipPersistenceBoundary();
    const remoteDevice: DeviceInfo = {
      id: 'offline-desktop-peer',
      name: 'Offline Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    let remote = buildSyncEngine({
      pairingEntitlement: mesh.peer(),
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      getSharedSecret: deviceId =>
        remotePersistence.getActive(deviceId)?.sharedSecret,
      pairingPersistence: remotePersistence,
      membershipPersistence: remotePersistence,
    });
    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;

    await syncService.start();
    const mobile = useSyncStore.getState().thisDevice;
    const firstDiscovery = getDiscoveryBoundaries().at(-1);
    if (!mobile || !firstDiscovery?.publishedPort) {
      throw new Error('Sync did not publish the mobile device');
    }

    const pairing = remote.engine.pair(
      { ...mobile, host: '127.0.0.1', port: firstDiscovery.publishedPort },
      phonePairingCode(),
    );
    await waitFor(() =>
      useSyncStore
        .getState()
        .pairingAttempts.some(
          attempt =>
            attempt.device.id === remoteDevice.id &&
            attempt.stage === 'waiting_for_confirmation',
        ),
    );
    await pairing;
    await waitFor(() =>
      useSyncStore
        .getState()
        .knownDevices.some(device => device.id === remoteDevice.id),
    );

    await remote.engine.stop();
    await waitFor(
      () =>
        useSyncStore
          .getState()
          .knownDevices.find(device => device.id === remoteDevice.id)
          ?.status === 'offline',
      3000,
      'offline peer',
    );
    await syncService.forgetDevice(remoteDevice.id);
    await waitFor(() => {
      const stored = JSON.parse(persistedPairings ?? '{}') as {
        pendingRevocations?: Record<string, unknown>;
      };
      return Boolean(stored.pendingRevocations?.[remoteDevice.id]);
    });
    expect(useSyncStore.getState().knownDevices).toEqual([]);

    await syncService.stop();
    await syncService.start();
    await waitFor(
      () =>
        useSyncStore
          .getState()
          .membershipRevocations.some(
            revocation =>
              revocation.device.id === remoteDevice.id &&
              revocation.stage === 'failed',
          ),
      3000,
      'restored pending eviction',
    );

    remote = buildSyncEngine({
      pairingEntitlement: mesh.peer(),
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      getSharedSecret: deviceId =>
        remotePersistence.getActive(deviceId)?.sharedSecret,
      pairingPersistence: remotePersistence,
      membershipPersistence: remotePersistence,
    });
    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;
    getDiscoveryBoundaries().at(-1)!.resolve(remoteDevice);

    await waitFor(
      () => remotePersistence.getActive(mobile.id) === undefined,
      3000,
      'rediscovered peer revocation',
    );
    await waitFor(() => {
      const stored = JSON.parse(persistedPairings ?? '{}') as {
        pendingRevocations?: Record<string, unknown>;
      };
      return Object.keys(stored.pendingRevocations ?? {}).length === 0;
    });
    expect(
      useSyncStore
        .getState()
        .membershipRevocations.some(
          revocation =>
            revocation.device.id === remoteDevice.id &&
            revocation.stage === 'completed',
        ),
    ).toBe(true);

    await remote.engine.stop();
  });
});
