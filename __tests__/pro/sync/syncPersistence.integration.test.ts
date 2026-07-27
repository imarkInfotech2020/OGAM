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
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for Sync state');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

describe('Pro Sync app-lifetime pairing persistence', () => {
  let persistedPairings: string | undefined;

  beforeEach(async () => {
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
    await syncService.stop();
  });

  it('silently reconnects a paired device after the mobile Sync service restarts', async () => {
    let remoteSecret: string | undefined;
    const remoteDevice: DeviceInfo = {
      id: 'desktop-peer',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    const remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      getSharedSecret: deviceId =>
        deviceId === useSyncStore.getState().thisDevice?.id
          ? remoteSecret
          : undefined,
      onPaired: device => {
        remoteSecret = device.sharedSecret;
      },
    });
    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;

    await syncService.start();
    const mobile = useSyncStore.getState().thisDevice;
    const firstDiscovery = getDiscoveryBoundaries().at(-1);
    expect(mobile).toBeDefined();
    expect(firstDiscovery?.publishedPort).toBeGreaterThan(0);

    await remote.engine.pair(
      { ...mobile!, host: '127.0.0.1', port: firstDiscovery!.publishedPort! },
      'blue-otter-42',
    );
    await waitFor(
      () =>
        useSyncStore.getState().incomingPairingDevice?.id === remoteDevice.id,
    );
    syncService.acceptIncomingPairing('blue-otter-42');
    await waitFor(() =>
      useSyncStore
        .getState()
        .paired.some(device => device.id === remoteDevice.id),
    );
    await waitFor(() => Boolean(persistedPairings));

    await syncService.stop();
    expect(useSyncStore.getState().status).toBe('idle');

    await syncService.start();
    const discovery = getDiscoveryBoundaries().at(-1);
    expect(discovery).toBeDefined();
    discovery!.resolve(remoteDevice);

    await waitFor(() =>
      useSyncStore
        .getState()
        .paired.some(device => device.id === remoteDevice.id),
    );
    expect(useSyncStore.getState().discovered).toHaveLength(0);

    await remote.engine.stop();
  });
});
