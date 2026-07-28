import React from 'react';
import {
  Alert,
  Linking,
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import TcpSocket from 'react-native-tcp-socket';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  CLIPBOARD_CHANNEL,
  MAX_CLIPBOARD_TEXT_BYTES,
  type DeviceInfo,
} from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import { buildSyncEngine } from '../../../src/services/sync/engine';
import type {
  NativeClipboardBoundary,
  NativeClipboardChange,
} from '../../../src/services/sync/nativeClipboard';
import {
  MobileClipboardSyncService,
  clipboardSyncService,
} from '../../../pro/sync/clipboardSyncService';
import { ClipboardPreferences } from '../../../pro/sync/clipboardPreferences';
import { ClipboardHistoryStore } from '../../../pro/sync/clipboardHistoryStore';
import { syncService } from '../../../pro/sync/syncService';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { ClipboardScreen } from '../../../pro/ui/ClipboardScreen';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { SyncSettingsSection } from '../../../pro/ui/SyncSettingsSection';
import { ProRoot } from '../../../pro/ui/ProRoot';
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
import {
  createNativeTcpBoundary,
  getDiscoveryBoundaries,
  resetDiscoveryBoundaries,
} from '../../utils/nativeSyncBoundaries';
import { createDownloadedModel } from '../../utils/factories';

jest.mock('@react-navigation/native', () =>
  jest.requireActual('@react-navigation/native'),
);

jest.mock('react-native-tcp-socket', () => {
  const {
    createNativeTcpBoundary: createBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createBoundary() };
});

jest.mock('react-native-zeroconf', () => {
  const {
    createNativeDiscoveryBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeDiscoveryBoundary() };
});

class ClipboardBoundary implements NativeClipboardBoundary {
  enabled = false;
  readonly writes: string[] = [];
  private listener: ((change: NativeClipboardChange) => void) | null = null;

  observe(listener: (change: NativeClipboardChange) => void): () => void {
    this.enabled = true;
    this.listener = listener;
    return () => {
      this.enabled = false;
      this.listener = null;
    };
  }

  copy(text: string, ts: number): void {
    if (this.enabled) this.listener?.({ text, ts });
  }

  writeText(text: string): void {
    this.writes.push(text);
    this.copy(text, Date.now());
  }
}

const device = (id: string, platform: DeviceInfo['platform']): DeviceInfo => ({
  id,
  name: id,
  platform,
  version: '1',
  host: '127.0.0.1',
  port: 0,
});

describe('mobile clipboard Sync journey', () => {
  let remote: ReturnType<typeof buildSyncEngine> | undefined;
  let ui: ReturnType<typeof render> | undefined;

  beforeEach(async () => {
    await clipboardSyncService.stop();
    await AsyncStorage.clear();
    await clipboardSyncService.clearHistory();
    await clipboardSyncService.stop();
    resetDiscoveryBoundaries();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });
    registerScreen({ name: 'Clipboard', component: ClipboardScreen });
    registerSettingsSection(SyncSettingsSection);
    useAppStore.getState().setOnboardingComplete(true);
    useAppStore
      .getState()
      .setDownloadedModels([createDownloadedModel({ engine: 'litert' })]);
    useSyncStore.getState().reset();
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  });

  afterEach(async () => {
    ui?.unmount();
    await remote?.engine.stop();
    await syncService.stop();
    await clipboardSyncService.stop();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    jest.restoreAllMocks();
  });

  it('syncs opted-in native clipboard text once over the encrypted app channel', async () => {
    const tcpModule = createNativeTcpBoundary() as RnTcpModule;
    const mobileDevice = device('mobile-clipboard', 'ios');
    const desktopDevice = device('desktop-clipboard', 'macos');
    const connected = new Set<string>();
    const mobileAppListeners = new Set<
      (deviceId: string, channel: string, data: unknown) => void
    >();
    const receivedByDesktop: unknown[] = [];

    const mobile = buildSyncEngine({
      localDevice: mobileDevice,
      tcpModule,
      getPassphrase: async () => 'green-river-42',
      onPaired: peer => connected.add(peer.id),
      onAppMessage: (deviceId, channel, data) => {
        for (const listener of mobileAppListeners) {
          listener(deviceId, channel, data);
        }
      },
    });
    const desktop = buildSyncEngine({
      localDevice: desktopDevice,
      tcpModule,
      getPassphrase: async () => 'green-river-42',
      onAppMessage: (_deviceId, channel, data) => {
        if (channel === CLIPBOARD_CHANNEL) receivedByDesktop.push(data);
      },
    });
    const nativeClipboard = new ClipboardBoundary();
    const history = new ClipboardHistoryStore();
    const service = new MobileClipboardSyncService({
      nativeClipboard,
      preferences: new ClipboardPreferences(),
      history,
      transport: {
        sendApp: (deviceId, channel, data) =>
          mobile.engine.sendApp(deviceId, channel, data),
        connectedDeviceIds: () => [...connected],
        deviceName: deviceId =>
          deviceId === desktopDevice.id ? 'Off Grid AI Desktop' : undefined,
        onAppMessage: listener => {
          mobileAppListeners.add(listener);
          return () => mobileAppListeners.delete(listener);
        },
      },
      now: () => 10_000,
    });

    await Promise.all([mobile.engine.start(0), desktop.engine.start(0)]);
    desktopDevice.port = desktop.transport.boundPort ?? 0;
    await mobile.engine.pair(desktopDevice, 'green-river-42');
    await waitFor(() => expect(connected.has(desktopDevice.id)).toBe(true));
    await service.start();

    nativeClipboard.copy('disabled stays on phone', 1);
    expect(receivedByDesktop).toEqual([]);

    await service.setEnabled(true);
    expect(nativeClipboard.enabled).toBe(true);
    nativeClipboard.copy('copied on iPhone', 2);
    await waitFor(() =>
      expect(receivedByDesktop).toEqual([
        { t: 'text', text: 'copied on iPhone', ts: 2 },
      ]),
    );

    const inbound = { t: 'text', text: 'copied on Mac', ts: 3 };
    expect(
      desktop.engine.sendApp(mobileDevice.id, CLIPBOARD_CHANNEL, inbound),
    ).toBe(true);
    await waitFor(() =>
      expect(nativeClipboard.writes).toEqual(['copied on Mac']),
    );
    await waitFor(() =>
      expect(service.historySnapshot()).toEqual([
        expect.objectContaining({
          text: 'copied on Mac',
          source: 'remote',
          sourceDeviceName: 'Off Grid AI Desktop',
        }),
        expect.objectContaining({
          text: 'copied on iPhone',
          source: 'local',
          sourceDeviceName: 'This phone',
        }),
      ]),
    );
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(receivedByDesktop).toHaveLength(1);

    desktop.engine.sendApp(mobileDevice.id, CLIPBOARD_CHANNEL, inbound);
    desktop.engine.sendApp(mobileDevice.id, CLIPBOARD_CHANNEL, {
      t: 'text',
      text: 'missing timestamp',
    });
    desktop.engine.sendApp(mobileDevice.id, CLIPBOARD_CHANNEL, {
      t: 'text',
      text: 'x'.repeat(MAX_CLIPBOARD_TEXT_BYTES + 1),
      ts: 4,
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(nativeClipboard.writes).toEqual(['copied on Mac']);

    await service.stop();
    const restoredBoundary = new ClipboardBoundary();
    const restored = new MobileClipboardSyncService({
      nativeClipboard: restoredBoundary,
      preferences: new ClipboardPreferences(),
      transport: {
        sendApp: (deviceId, channel, data) =>
          mobile.engine.sendApp(deviceId, channel, data),
        connectedDeviceIds: () => [...connected],
        deviceName: deviceId =>
          deviceId === desktopDevice.id ? 'Off Grid AI Desktop' : undefined,
        onAppMessage: listener => {
          mobileAppListeners.add(listener);
          return () => mobileAppListeners.delete(listener);
        },
      },
    });
    await restored.start();
    expect(restored.enabled()).toBe(true);
    expect(restoredBoundary.enabled).toBe(true);

    await restored.setEnabled(false);
    expect(restoredBoundary.enabled).toBe(false);
    desktop.engine.sendApp(mobileDevice.id, CLIPBOARD_CHANNEL, {
      t: 'text',
      text: 'disabled receiver',
      ts: 5,
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(restoredBoundary.writes).toEqual([]);

    await restored.stop();
    await Promise.all([mobile.engine.stop(), desktop.engine.stop()]);
  });

  it('shows attributed clipboard history through Settings and manages it', async () => {
    let nativeChange: ((change: NativeClipboardChange) => void) | undefined;
    const nativeModule = {
      setEnabled: jest.fn(),
      writeText: jest.fn(),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    NativeModules.SyncClipboardModule = nativeModule;
    jest
      .spyOn(NativeEventEmitter.prototype, 'addListener')
      .mockImplementation((eventName, listener) => {
        if (eventName === 'SyncClipboardChanged') {
          nativeChange = listener as (change: NativeClipboardChange) => void;
        }
        return { remove: jest.fn() } as unknown as EmitterSubscription;
      });

    const remoteDevice: DeviceInfo = {
      id: 'clipboard-desktop',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: TcpSocket as unknown as RnTcpModule,
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
    fireEvent.press(ui.getByTestId('settings-tab'));
    fireEvent.press(await waitFor(() => ui!.getByTestId('open-sync-settings')));
    await waitFor(() =>
      expect(ui!.getByText('Discoverable on your Wi-Fi')).toBeTruthy(),
    );

    const mobile = useSyncStore.getState().thisDevice;
    const discovery = getDiscoveryBoundaries().at(-1);
    if (!mobile || !discovery?.publishedPort) {
      throw new Error('Sync did not publish the mobile device');
    }
    const pairing = remote.engine.pair(
      {
        ...mobile,
        host: '127.0.0.1',
        port: discovery.publishedPort,
      },
      'green-river-42',
    );
    await waitFor(() =>
      expect(ui!.getByText('Pair with Off Grid AI Desktop')).toBeTruthy(),
    );
    fireEvent.changeText(
      ui.getByTestId('incoming-pairing-code'),
      'green-river-42',
    );
    fireEvent.press(ui.getByTestId('accept-incoming-pairing'));
    await pairing;

    const toggle = ui.getByTestId('sync-clipboard-toggle');
    expect(toggle.props.value).toBe(false);
    const openSettings = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined);
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() =>
      expect(nativeModule.setEnabled).toHaveBeenCalledWith(true),
    );
    await waitFor(() =>
      expect(ui!.getByText('Allow clipboard access')).toBeTruthy(),
    );
    expect(
      ui.getByText(
        'Settings > Apps > Off Grid AI > Paste from Other Apps > Allow',
      ),
    ).toBeTruthy();
    fireEvent.press(ui.getByTestId('open-clipboard-permission-settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);
    fireEvent.press(ui.getByText('Done'));
    await waitFor(() =>
      expect(ui!.queryByText('Allow clipboard access')).toBeNull(),
    );

    fireEvent(toggle, 'valueChange', false);
    await waitFor(() =>
      expect(nativeModule.setEnabled).toHaveBeenCalledWith(false),
    );
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() =>
      expect(nativeModule.setEnabled).toHaveBeenCalledTimes(3),
    );
    expect(ui.queryByText('Allow clipboard access')).toBeNull();
    expect(nativeChange).toBeDefined();

    nativeChange?.({ text: 'copied on iPhone', ts: 1000 });
    await waitFor(() =>
      expect(
        remote!.engine.sendApp(mobile.id, 'clipboard-test-ready', {}),
      ).toBe(true),
    );
    expect(
      remote.engine.sendApp(mobile.id, CLIPBOARD_CHANNEL, {
        t: 'text',
        text: 'copied on Mac',
        ts: 2000,
      }),
    ).toBe(true);
    await waitFor(() =>
      expect(nativeModule.writeText).toHaveBeenCalledWith('copied on Mac'),
    );

    fireEvent.press(ui.getByTestId('open-clipboard-history'));
    await waitFor(() => expect(ui!.getByText('copied on iPhone')).toBeTruthy());
    expect(ui.getByText('This phone')).toBeTruthy();
    expect(ui.getByText('copied on Mac')).toBeTruthy();
    expect(ui.getByText('From Off Grid AI Desktop')).toBeTruthy();

    fireEvent.press(
      ui.getAllByLabelText('Copy text from Off Grid AI Desktop')[0],
    );
    await waitFor(() =>
      expect(nativeModule.writeText).toHaveBeenLastCalledWith('copied on Mac'),
    );

    fireEvent.press(ui.getByLabelText('Delete text from Off Grid AI Desktop'));
    await waitFor(() => expect(ui!.queryByText('copied on Mac')).toBeNull());

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(ui.getByTestId('clipboard-clear'));
    const clear = (alert.mock.calls[0][2] ?? []).find(
      button => button.style === 'destructive',
    );
    clear?.onPress?.();
    await waitFor(() =>
      expect(ui!.getByTestId('clipboard-empty')).toBeTruthy(),
    );
  });
});
