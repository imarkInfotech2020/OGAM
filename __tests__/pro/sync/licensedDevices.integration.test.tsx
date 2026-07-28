import React from 'react';
import { Alert } from 'react-native';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import {
  render,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react-native';

import { AppNavigator } from '../../../src/navigation/AppNavigator';
import {
  registerScreen,
  _clearScreensForTesting,
} from '../../../src/navigation/screenRegistry';
import { _clearSectionsForTesting } from '../../../src/components/settings/sectionRegistry';
import { useAppStore } from '../../../src/stores/appStore';
import { createDownloadedModel } from '../../utils/factories';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { syncService } from '../../../pro/sync/syncService';

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

const originalFetch = global.fetch;
const storedSecrets = new Map<string, string>();

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('Settings to Sync licensed-device management', () => {
  beforeEach(async () => {
    await syncService.stop();
    await AsyncStorage.clear();
    jest.clearAllMocks();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });

    const app = useAppStore.getState();
    app.setOnboardingComplete(true);
    app.setDownloadedModels([createDownloadedModel()]);
    app.setThemeMode('dark');
    app.setHasRegisteredPro(true);
    app.setProActive(true);
    useSyncStore.getState().reset();

    storedSecrets.clear();
    storedSecrets.set(
      'off-grid-pro-license',
      JSON.stringify({
        isPro: true,
        key: 'key/abc',
        licenseId: 'lic-1',
        expiry: null,
        verifiedAt: 0,
      }),
    );
    storedSecrets.set('off-grid-device-fingerprint', 'fp-current');
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      async ({ service }: { service: string }) => {
        const value = storedSecrets.get(service);
        return value ? { username: 'stored', password: value } : false;
      },
    );
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      async (
        _username: string,
        password: string,
        options: { service: string },
      ) => {
        storedSecrets.set(options.service, password);
        return true;
      },
    );

    const machines = [
      {
        id: 'current',
        attributes: {
          fingerprint: 'fp-current',
          platform: 'ios',
          name: 'My iPhone',
          lastHeartbeat: '2026-07-26T00:00:00.000Z',
        },
      },
      {
        id: 'old',
        attributes: {
          fingerprint: 'fp-old',
          platform: 'android',
          name: 'Old Android',
          lastHeartbeat: '2026-01-01T00:00:00.000Z',
        },
      },
    ];
    global.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/licenses/lic-1/machines')) {
          return response(200, { data: machines });
        }
        if (url.endsWith('/machines/old') && init?.method === 'DELETE') {
          machines.splice(1, 1);
          return response(204);
        }
        return response(404);
      },
    ) as typeof fetch;
  });

  afterEach(async () => {
    await syncService.stop();
    global.fetch = originalFetch;
    _clearScreensForTesting();
    _clearSectionsForTesting();
  });

  it('opens Sync, shows active machines, and deactivates a previous device', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const ui = render(
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>,
    );

    fireEvent.press(ui.getByTestId('settings-tab'));
    fireEvent.press(await waitFor(() => ui.getByTestId('open-sync-settings')));

    await waitFor(() => expect(ui.getByText('2 of 5 active')).toBeTruthy());
    expect(ui.getByText('My iPhone')).toBeTruthy();
    expect(
      within(ui.getByTestId('licensed-device-current')).getByText(
        'THIS DEVICE',
      ),
    ).toBeTruthy();
    expect(ui.getByText('Old Android')).toBeTruthy();

    fireEvent.press(ui.getByTestId('deactivate-device-old'));
    const destructiveAction = (alert.mock.calls[0][2] ?? []).find(
      button => button.style === 'destructive',
    );
    destructiveAction?.onPress?.();

    await waitFor(() => expect(ui.getByText('1 of 5 active')).toBeTruthy());
    expect(ui.queryByText('Old Android')).toBeNull();
    expect(ui.getByText('My iPhone')).toBeTruthy();
    alert.mockRestore();
    ui.unmount();
  });

  it('labels Debug Pro without claiming a Keygen device slot', async () => {
    storedSecrets.delete('off-grid-pro-license');
    useAppStore.getState().setHasRegisteredPro(false);
    useAppStore.getState().setProActive(true);

    const ui = render(
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>,
    );

    fireEvent.press(ui.getByTestId('settings-tab'));
    await waitFor(() =>
      expect(ui.getByText('Development · active')).toBeTruthy(),
    );
    fireEvent.press(await waitFor(() => ui.getByTestId('open-sync-settings')));

    await waitFor(() => expect(ui.getByText('DEVELOPMENT PRO')).toBeTruthy());
    expect(ui.getByText('Local development access')).toBeTruthy();
    expect(
      ui.getByText(
        'This Debug build unlocks Pro locally. Device slots appear after activating a license key.',
      ),
    ).toBeTruthy();
    expect(ui.queryByText('0 of 5 active')).toBeNull();
    expect(ui.queryByText('No licensed devices are active.')).toBeNull();
    expect(ui.getByPlaceholderText('Enter a pairing code')).toBeTruthy();

    ui.unmount();
  });
});
