import React from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import {
  createNativeTcpBoundary,
  resetDiscoveryBoundaries,
} from '../../utils/nativeSyncBoundaries';

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
  beforeEach(async () => {
    await clipboardSyncService.stop();
    await AsyncStorage.clear();
    resetDiscoveryBoundaries();
  });

  afterEach(async () => {
    await clipboardSyncService.stop();
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
    const service = new MobileClipboardSyncService({
      nativeClipboard,
      preferences: new ClipboardPreferences(),
      transport: {
        sendApp: (deviceId, channel, data) =>
          mobile.engine.sendApp(deviceId, channel, data),
        connectedDeviceIds: () => [...connected],
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

  it('exposes the persisted opt-in on the rendered Sync screen', async () => {
    const nativeModule = {
      setEnabled: jest.fn(),
      writeText: jest.fn(),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    NativeModules.SyncClipboardModule = nativeModule;
    jest
      .spyOn(NativeEventEmitter.prototype, 'addListener')
      .mockReturnValue({ remove: jest.fn() } as unknown as EmitterSubscription);

    const ui = render(
      <NavigationContainer>
        <SyncScreen />
      </NavigationContainer>,
    );
    const toggle = ui.getByTestId('sync-clipboard-toggle');
    expect(toggle.props.value).toBe(false);

    fireEvent(toggle, 'valueChange', true);
    await waitFor(() =>
      expect(nativeModule.setEnabled).toHaveBeenCalledWith(true),
    );
    expect(ui.getByTestId('sync-clipboard-toggle').props.value).toBe(true);
    expect(
      JSON.parse(
        (await AsyncStorage.getItem('offgrid-sync-clipboard-v1')) ?? '{}',
      ),
    ).toEqual({ enabled: true });

    ui.unmount();
  });
});
