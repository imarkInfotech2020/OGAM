import React from 'react';
import { Alert } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { NavigationContainer } from '@react-navigation/native';
import {
  render,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react-native';

jest.mock('@react-navigation/native', () =>
  jest.requireActual('@react-navigation/native'),
);

import { AppNavigator } from '../../../src/navigation/AppNavigator';
import {
  registerScreen,
  _clearScreensForTesting,
} from '../../../src/navigation/screenRegistry';
import {
  _clearSectionsForTesting,
} from '../../../src/components/settings/sectionRegistry';
import { useAppStore } from '../../../src/stores/appStore';
import { createDownloadedModel } from '../../utils/factories';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { syncService } from '../../../pro/sync/syncService';
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
    server.listen = jest.fn(
      (options: { port: number }, callback?: () => void) => {
        boundPort = options.port || 42001;
        callback?.();
      },
    );
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
  beforeEach(async () => {
    await syncService.stop();
    jest.clearAllMocks();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });

    useAppStore.setState({
      hasCompletedOnboarding: true,
      downloadedModels: [createDownloadedModel()],
      themeMode: 'dark',
      hasRegisteredPro: true,
      isProActive: true,
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
    useAppStore.setState({
      hasRegisteredPro: false,
      isProActive: true,
    });

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

  it('keeps an offline paired device visible and lets the user forget it', async () => {
    storedSecrets.set(
      'off-grid-sync-pairings',
      JSON.stringify({
        version: 2,
        pairings: {
          'desktop-peer': {
            device: {
              id: 'desktop-peer',
              name: 'Off Grid AI Desktop',
              platform: 'macos',
              version: '1',
              host: '192.168.1.27',
              port: 52095,
            },
            pairedAt: Date.parse('2026-07-26T10:00:00.000Z'),
            lastSeenAt: Date.parse('2026-07-27T10:00:00.000Z'),
            state: 'trusted',
            secret: 'saved-secret',
          },
        },
      }),
    );
    await syncService.start();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const ui = render(
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>,
    );

    fireEvent.press(ui.getByTestId('settings-tab'));
    fireEvent.press(await waitFor(() => ui.getByTestId('open-sync-settings')));

    const deviceRow = await waitFor(() =>
      ui.getByTestId('sync-paired-desktop-peer'),
    );
    expect(within(deviceRow).getByText(/Offline - last seen/)).toBeTruthy();

    fireEvent.press(ui.getByTestId('sync-forget-desktop-peer'));
    const destructiveAction = (alert.mock.calls[0][2] ?? []).find(
      button => button.style === 'destructive',
    );
    destructiveAction?.onPress?.();

    await waitFor(() =>
      expect(ui.queryByTestId('sync-paired-desktop-peer')).toBeNull(),
    );
    expect(
      JSON.parse(storedSecrets.get('off-grid-sync-pairings') ?? '{}'),
    ).toEqual({ version: 2, pairings: {} });

    alert.mockRestore();
    ui.unmount();
  });
});
