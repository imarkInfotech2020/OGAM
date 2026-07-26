import React from 'react';
import { Alert } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { NavigationContainer } from '@react-navigation/native';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));

import { AppNavigator } from '../../../src/navigation/AppNavigator';
import {
  registerScreen,
  _clearScreensForTesting,
} from '../../../src/navigation/screenRegistry';
import {
  registerSettingsSection,
  _clearSectionsForTesting,
} from '../../../src/components/settings/sectionRegistry';
import { useAppStore } from '../../../src/stores/appStore';
import { createDownloadedModel } from '../../utils/factories';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { SyncSettingsSection } from '../../../pro/ui/SyncSettingsSection';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { useLicensedDevicesStore } from '../../../pro/sync/licensedDevicesStore';

const mockTcpModule = {
  createServer: jest.fn(() => {
    let boundPort = 0;
    const server = {} as {
      on: jest.Mock;
      listen: jest.Mock;
      address: jest.Mock;
      close: jest.Mock;
    };
    server.on = jest.fn(() => server);
    server.listen = jest.fn((options: { port: number }, callback?: () => void) => {
      boundPort = options.port || 42001;
      callback?.();
    });
    server.address = jest.fn(() => ({ port: boundPort }));
    server.close = jest.fn();
    return server;
  }),
  createConnection: jest.fn(),
};

jest.mock('react-native-tcp-socket', () => ({
  __esModule: true,
  default: mockTcpModule,
}));

class MockZeroconf {
  on = jest.fn();
  scan = jest.fn();
  stop = jest.fn();
  removeDeviceListeners = jest.fn();
  publishService = jest.fn();
  unpublishService = jest.fn();
}

jest.mock('react-native-zeroconf', () => ({
  __esModule: true,
  default: MockZeroconf,
}));

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
  beforeEach(() => {
    jest.clearAllMocks();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });
    registerSettingsSection(SyncSettingsSection);

    useAppStore.setState({
      hasCompletedOnboarding: true,
      downloadedModels: [createDownloadedModel()],
      themeMode: 'dark',
    });
    useSyncStore.getState().reset();
    useLicensedDevicesStore.setState({
      status: 'idle',
      devices: [],
      removingDeviceId: null,
      error: undefined,
    });

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
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/licenses/lic-1/machines')) {
        return response(200, { data: machines });
      }
      if (url.endsWith('/machines/old') && init?.method === 'DELETE') {
        machines.splice(1, 1);
        return response(204);
      }
      return response(404);
    }) as typeof fetch;
  });

  afterEach(async () => {
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
      within(ui.getByTestId('licensed-device-current')).getByText('THIS DEVICE'),
    ).toBeTruthy();
    expect(ui.getByText('Old Android')).toBeTruthy();

    fireEvent.press(ui.getByTestId('deactivate-device-old'));
    const destructiveAction = (alert.mock.calls[0][2] ?? []).find(
      (button) => button.style === 'destructive',
    );
    destructiveAction?.onPress?.();

    await waitFor(() => expect(ui.getByText('1 of 5 active')).toBeTruthy());
    expect(ui.queryByText('Old Android')).toBeNull();
    expect(ui.getByText('My iPhone')).toBeTruthy();
    alert.mockRestore();
    ui.unmount();
  });
});
