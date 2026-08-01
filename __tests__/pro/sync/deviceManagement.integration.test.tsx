import React from 'react';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import TcpSocket from 'react-native-tcp-socket';
import type { DeviceInfo } from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import { AppNavigator } from '../../../src/navigation/AppNavigator';
import {
  registerScreen,
  _clearScreensForTesting,
} from '../../../src/navigation/screenRegistry';
import {
  _clearSlotsForTesting,
  registerSlot,
  SLOTS,
} from '../../../src/bootstrap/slotRegistry';
import { _clearSectionsForTesting } from '../../../src/components/settings/sectionRegistry';
import { useAppStore } from '../../../src/stores/appStore';
import { buildSyncEngine } from '../../../src/services/sync/engine';
import { syncService } from '../../../pro/sync/syncService';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { SyncHomeCard } from '../../../pro/ui/SyncHomeCard';
import { ProRoot } from '../../../pro/ui/ProRoot';
import {
  getDiscoveryBoundaries,
  resetDiscoveryBoundaries,
} from '../../utils/nativeSyncBoundaries';
import { pairingCodeOnScreen } from '../../utils/pairFromPeer';
import { createDownloadedModel } from '../../utils/factories';
import { MembershipPersistenceBoundary } from '../../utils/membershipPersistenceBoundary';

jest.unmock('@react-navigation/native');

jest.mock('react-native-tcp-socket', () => {
  const {
    createNativeTcpBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeTcpBoundary() };
});

jest.mock('react-native-zeroconf', () => {
  const {
    createNativeDiscoveryBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeDiscoveryBoundary() };
});

const nativeTcpBoundary = TcpSocket as unknown as RnTcpModule;

describe('Pro mobile saved-device management journey', () => {
  let remote: ReturnType<typeof buildSyncEngine> | undefined;
  let ui: ReturnType<typeof render> | undefined;
  let storedPairings: string | undefined;
  let failNextPairingSave = false;

  beforeEach(async () => {
    await AsyncStorage.clear();
    resetDiscoveryBoundaries();
    _clearScreensForTesting();
    _clearSlotsForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });
    registerSlot(SLOTS.homeSyncCard, SyncHomeCard);
    useAppStore.getState().setOnboardingComplete(true);
    // Pro is an entitlement the app is told about, so it is seeded like any other outside fact.
    useAppStore.getState().setProActive(true);
    useAppStore
      .getState()
      .setDownloadedModels([createDownloadedModel({ engine: 'litert' })]);
    useSyncStore.getState().reset();
    storedPairings = undefined;
    failNextPairingSave = false;
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      async ({ service }: { service: string }) =>
        service === 'off-grid-sync-pairings' && storedPairings
          ? { username: 'sync-pairings', password: storedPairings }
          : false,
    );
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      async (
        _username: string,
        password: string,
        options: { service: string },
      ) => {
        if (options.service === 'off-grid-sync-pairings') {
          if (failNextPairingSave) {
            failNextPairingSave = false;
            throw new Error('Keychain unavailable');
          }
          storedPairings = password;
        }
        return true;
      },
    );
  });

  afterEach(async () => {
    ui?.unmount();
    await remote?.engine.stop();
    await syncService.stop();
    _clearScreensForTesting();
    _clearSlotsForTesting();
    _clearSectionsForTesting();
  });

  it('disconnects, reconnects, renames persistently, and forgets a paired desktop', async () => {
    const remoteDevice: DeviceInfo = {
      id: 'desktop-managed-peer',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    const remotePersistence = new MembershipPersistenceBoundary();
    remote = buildSyncEngine({
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

    ui = render(
      <>
        <ProRoot />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </>,
    );
    expect(await waitFor(() => ui!.getByTestId('sync-home-card'))).toBeTruthy();
    fireEvent.press(ui.getByTestId('open-sync-from-home'));
    expect(ui.getByTestId('sync-open-sharing')).toBeTruthy();
    expect(ui.getByTestId('sync-open-activity')).toBeTruthy();
    expect(ui.queryByTestId('sync-chats-toggle')).toBeNull();

    const mobile = useSyncStore.getState().thisDevice;
    const discovery = getDiscoveryBoundaries().at(-1);
    if (!mobile || !discovery?.publishedPort) {
      throw new Error('Sync did not publish the mobile device');
    }
    const pairing = remote.engine.pair(
      { ...mobile, host: '127.0.0.1', port: discovery.publishedPort },
      await pairingCodeOnScreen(ui),
    );
    // Nothing to confirm: the peer presented this phone's own code, so pairing completes.
    await pairing;

    const connectedRow = await waitFor(() =>
      ui!.getByTestId(`sync-paired-${remoteDevice.id}`),
    );
    expect(within(connectedRow).getByText(/Connected/)).toBeTruthy();
    expect(
      within(connectedRow).getByLabelText('Rename Off Grid AI Desktop'),
    ).toBeTruthy();
    expect(within(connectedRow).queryByText('Rename')).toBeNull();

    fireEvent.press(ui.getByTestId(`sync-disconnect-${remoteDevice.id}`));
    await waitFor(() =>
      expect(
        within(ui!.getByTestId(`sync-paired-${remoteDevice.id}`)).getByText(
          /Nearby/,
        ),
      ).toBeTruthy(),
    );
    expect(ui.getByTestId(`sync-reconnect-${remoteDevice.id}`)).toBeTruthy();

    fireEvent.press(ui.getByLabelText('Back'));
    await waitFor(() => expect(ui!.getByTestId('sync-home-card')).toBeTruthy());
    expect(ui.getByText('Sync needs attention')).toBeTruthy();
    expect(
      ui.getByText('2 of 5 devices saved. 1 peer is offline.'),
    ).toBeTruthy();
    fireEvent.press(ui.getByTestId('open-sync-from-home'));

    fireEvent.press(ui.getByTestId(`sync-reconnect-${remoteDevice.id}`));
    await waitFor(() =>
      expect(
        within(ui!.getByTestId(`sync-paired-${remoteDevice.id}`)).getByText(
          /Connected/,
        ),
      ).toBeTruthy(),
    );
    fireEvent.press(ui.getByLabelText('Back'));
    await waitFor(() =>
      expect(ui!.getByText('2 of 5 devices saved. 1 connected.')).toBeTruthy(),
    );
    fireEvent.press(ui.getByTestId('open-sync-from-home'));

    fireEvent.press(ui.getByTestId(`sync-rename-${remoteDevice.id}`));
    await waitFor(() =>
      expect(ui!.getByText('Rename Off Grid AI Desktop')).toBeTruthy(),
    );
    fireEvent.changeText(ui.getByTestId('sync-rename-input'), 'Studio Mac');
    fireEvent.press(ui.getByTestId('sync-rename-save'));
    await waitFor(() =>
      expect(
        within(ui!.getByTestId(`sync-paired-${remoteDevice.id}`)).getByText(
          'Studio Mac',
        ),
      ).toBeTruthy(),
    );
    expect(JSON.parse(storedPairings ?? '{}')).toEqual(
      expect.objectContaining({
        pairings: expect.objectContaining({
          [remoteDevice.id]: expect.objectContaining({ alias: 'Studio Mac' }),
        }),
      }),
    );

    await remote.engine.stop();
    await waitFor(() =>
      expect(
        within(ui!.getByTestId(`sync-paired-${remoteDevice.id}`)).getByText(
          /Offline/,
        ),
      ).toBeTruthy(),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(ui.getByTestId(`sync-forget-${remoteDevice.id}`));
    expect(alert.mock.calls[0][0]).toBe('Evict Studio Mac?');
    expect(alert.mock.calls[0][1]).toBe(
      'This removes the pairing from both devices. Either device must pair again before Sync can reconnect.',
    );
    const destructiveAction = (alert.mock.calls[0][2] ?? []).find(
      button => button.style === 'destructive',
    );
    expect(destructiveAction?.text).toBe('Evict device');
    destructiveAction?.onPress?.();
    await waitFor(() =>
      expect(ui!.queryByTestId(`sync-paired-${remoteDevice.id}`)).toBeNull(),
    );
    await waitFor(() => expect(ui!.getByText(/Could not reach/)).toBeTruthy());
    const pendingEviction = ui.getByTestId(
      `sync-discovered-${remoteDevice.id}`,
    );
    expect(within(pendingEviction).getByText(/Could not reach/)).toBeTruthy();
    expect(
      within(pendingEviction).getByTestId(
        `sync-retry-eviction-${remoteDevice.id}`,
      ),
    ).toBeTruthy();
    expect(
      within(pendingEviction).getByTestId(
        `sync-dismiss-eviction-${remoteDevice.id}`,
      ),
    ).toBeTruthy();
    expect(ui.getByText('1 of 5 devices saved')).toBeTruthy();
    fireEvent.press(
      within(pendingEviction).getByTestId(
        `sync-dismiss-eviction-${remoteDevice.id}`,
      ),
    );
    await waitFor(() =>
      expect(
        ui!.queryByTestId(`sync-discovered-${remoteDevice.id}`),
      ).toBeNull(),
    );

    remote = buildSyncEngine({
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
    await waitFor(() =>
      expect(remotePersistence.getActive(mobile.id)).toBeUndefined(),
    );
    await waitFor(() =>
      expect(
        JSON.parse(storedPairings ?? '{}').pendingRevocations,
      ).toEqual({}),
    );
    await waitFor(() =>
      expect(
        within(
          ui!.getByTestId(`sync-discovered-${remoteDevice.id}`),
        ).getByTestId(`sync-pair-${remoteDevice.id}`),
      ).toBeTruthy(),
    );
    expect(JSON.parse(storedPairings ?? '{}')).toEqual(
      expect.objectContaining({
        version: 4,
        pairings: {},
        stagedPairings: {},
        pendingRevocations: {},
      }),
    );
    alert.mockRestore();
  });

  it('shows Mobile-initiated cancel, code, and persistence failures before a clean retry', async () => {
    const remoteDevice: DeviceInfo = {
      id: 'desktop-mismatch-peer',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    const passphraseResolvers: Array<(passphrase: string | null) => void> = [];
    remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      getPassphrase: (_device, context) =>
        new Promise(resolve => {
          passphraseResolvers.push(resolve);
          context.signal.addEventListener('abort', () => resolve(null), {
            once: true,
          });
        }),
    });
    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;
    await syncService.start();
    const mobile = useSyncStore.getState().thisDevice;
    if (!mobile) throw new Error('Sync did not create the Mobile device');

    ui = render(
      <>
        <ProRoot />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </>,
    );
    fireEvent.press(
      await waitFor(() => ui!.getByTestId('open-sync-from-home')),
    );
    const discovery = getDiscoveryBoundaries().at(-1);
    if (!discovery) {
      throw new Error('Sync did not start native discovery');
    }
    discovery.resolve(remoteDevice);
    await waitFor(() =>
      expect(
        ui!.getByTestId(`sync-discovered-${remoteDevice.id}`),
      ).toBeTruthy(),
    );
    fireEvent.changeText(ui.getByTestId('sync-pairing-code'), 'blue-otter-42');
    fireEvent.press(ui.getByTestId(`sync-pair-${remoteDevice.id}`));

    await waitFor(() =>
      expect(ui!.getByText('Waiting for confirmation')).toBeTruthy(),
    );
    expect(ui.getAllByText('Cancel')).toHaveLength(1);
    expect(ui.getByText('1 of 5 devices saved')).toBeTruthy();
    await waitFor(() => expect(passphraseResolvers).toHaveLength(1));
    fireEvent.press(ui.getByText('Cancel'));

    await waitFor(() =>
      expect(ui!.getByText('Pairing cancelled')).toBeTruthy(),
    );
    expect(ui.getByText('Pairing was cancelled.')).toBeTruthy();
    fireEvent.press(ui.getByTestId('retry-pairing-attempt'));
    await waitFor(() => expect(passphraseResolvers).toHaveLength(2));
    await waitFor(() =>
      expect(ui!.getByText('Waiting for confirmation')).toBeTruthy(),
    );
    passphraseResolvers[1]('wrong-code');

    await waitFor(() => expect(ui!.getByText('Pairing failed')).toBeTruthy());
    expect(ui.getByText('The pairing codes did not match.')).toBeTruthy();
    expect(ui.getByTestId('retry-pairing-attempt')).toBeTruthy();
    expect(
      useSyncStore
        .getState()
        .knownDevices.some(device => device.id === remoteDevice.id),
    ).toBe(false);

    fireEvent.press(ui.getByTestId('retry-pairing-attempt'));
    await waitFor(() => expect(passphraseResolvers).toHaveLength(3));
    await waitFor(() =>
      expect(ui!.getByText('Waiting for confirmation')).toBeTruthy(),
    );
    failNextPairingSave = true;
    passphraseResolvers[2]('blue-otter-42');

    await waitFor(() => expect(ui!.getByText('Pairing failed')).toBeTruthy());
    expect(ui.getByText('The pairing could not be saved.')).toBeTruthy();
    expect(remote.engine.isPaired(mobile.id)).toBe(false);
    expect(
      useSyncStore
        .getState()
        .knownDevices.some(device => device.id === remoteDevice.id),
    ).toBe(false);

    fireEvent.press(ui.getByTestId('retry-pairing-attempt'));
    await waitFor(() => expect(passphraseResolvers).toHaveLength(4));
    await waitFor(() =>
      expect(ui!.getByText('Waiting for confirmation')).toBeTruthy(),
    );
    passphraseResolvers[3]('blue-otter-42');

    await waitFor(() =>
      expect(
        useSyncStore
          .getState()
          .knownDevices.some(device => device.id === remoteDevice.id),
      ).toBe(true),
    );
    expect(ui.queryByTestId('pairing-attempt-sheet')).toBeNull();
    expect(ui.queryByText('Pairing failed')).toBeNull();
  });
});
