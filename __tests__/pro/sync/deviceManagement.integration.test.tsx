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
import { createDownloadedModel } from '../../utils/factories';

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

  beforeEach(async () => {
    await AsyncStorage.clear();
    resetDiscoveryBoundaries();
    _clearScreensForTesting();
    _clearSlotsForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });
    registerSlot(SLOTS.homeSyncCard, SyncHomeCard);
    useAppStore.getState().setOnboardingComplete(true);
    useAppStore
      .getState()
      .setDownloadedModels([createDownloadedModel({ engine: 'litert' })]);
    useSyncStore.getState().reset();
    storedPairings = undefined;
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
    let remoteSecret: string | undefined;
    remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      getSharedSecret: () => remoteSecret,
      onPaired: device => {
        remoteSecret = device.sharedSecret;
      },
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
      'blue-otter-42',
    );
    await waitFor(() =>
      expect(ui!.getByText('Pair with Off Grid AI Desktop')).toBeTruthy(),
    );
    fireEvent.changeText(
      ui.getByTestId('incoming-pairing-code'),
      'blue-otter-42',
    );
    fireEvent.press(ui.getByTestId('accept-incoming-pairing'));
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

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(ui.getByTestId(`sync-forget-${remoteDevice.id}`));
    const destructiveAction = (alert.mock.calls[0][2] ?? []).find(
      button => button.style === 'destructive',
    );
    destructiveAction?.onPress?.();
    await waitFor(() =>
      expect(ui!.queryByTestId(`sync-paired-${remoteDevice.id}`)).toBeNull(),
    );
    alert.mockRestore();
  });

  it('shows a mismatched incoming code and permits one clean corrected retry', async () => {
    const remoteDevice: DeviceInfo = {
      id: 'desktop-mismatch-peer',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    let pairingFailure: string | undefined;
    remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      onPairingFailed: (_device, error) => {
        pairingFailure = error;
      },
    });
    await remote.engine.start(0);
    await syncService.start();

    ui = render(
      <>
        <ProRoot />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </>,
    );
    const mobile = useSyncStore.getState().thisDevice;
    const discovery = getDiscoveryBoundaries().at(-1);
    if (!mobile || !discovery?.publishedPort) {
      throw new Error('Sync did not publish the mobile device');
    }
    const mobileEndpoint = {
      ...mobile,
      host: '127.0.0.1',
      port: discovery.publishedPort,
    };

    await remote.engine.pair(mobileEndpoint, 'blue-otter-42');
    await waitFor(() =>
      expect(ui!.getByText('Pair with Off Grid AI Desktop')).toBeTruthy(),
    );
    fireEvent.changeText(ui.getByTestId('incoming-pairing-code'), 'wrong-code');
    fireEvent.press(ui.getByTestId('accept-incoming-pairing'));

    await waitFor(() =>
      expect(
        ui!.getByText(
          'The pairing codes did not match. Start pairing again from the other device.',
        ),
      ).toBeTruthy(),
    );
    expect(pairingFailure).toBe('Passphrase mismatch');
    fireEvent.press(ui.getByText('Close'));
    await waitFor(() =>
      expect(ui!.queryByText('Pair with Off Grid AI Desktop')).toBeNull(),
    );

    await remote.engine.pair(mobileEndpoint, 'blue-otter-42');
    await waitFor(() =>
      expect(ui!.getByText('Pair with Off Grid AI Desktop')).toBeTruthy(),
    );
    fireEvent.changeText(
      ui.getByTestId('incoming-pairing-code'),
      'blue-otter-42',
    );
    fireEvent.press(ui.getByTestId('accept-incoming-pairing'));
    await waitFor(() =>
      expect(
        useSyncStore
          .getState()
          .knownDevices.some(device => device.id === remoteDevice.id),
      ).toBe(true),
    );
  });
});
