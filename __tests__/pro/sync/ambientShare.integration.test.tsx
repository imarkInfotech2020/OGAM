import React from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
} from 'react-native';
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
import {
  FileTransferManager,
  OpLog,
  SHARED_FILE_ENTITY,
  SHARED_FILE_MIME,
  StateSync,
  type DeviceInfo,
  type FileRequestMessage,
  type StateMsg,
  type TransferFileSink,
} from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import { AppNavigator } from '../../../src/navigation/AppNavigator';
import {
  _clearScreensForTesting,
  registerScreen,
} from '../../../src/navigation/screenRegistry';
import {
  _clearSectionsForTesting,
  registerSettingsSection,
} from '../../../src/components/settings/sectionRegistry';
import { useAppStore } from '../../../src/stores/appStore';
import { buildSyncEngine } from '../../../src/services/sync/engine';
import { stateSyncService } from '../../../pro/sync/stateSyncService';
import { sharedFileSyncService } from '../../../pro/sync/sharedFileSyncService';
import { syncService } from '../../../pro/sync/syncService';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { ambientShareService } from '../../../pro/sync/ambientShareService';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { SyncSettingsSection } from '../../../pro/ui/SyncSettingsSection';
import { ProRoot } from '../../../pro/ui/ProRoot';
import {
  getDiscoveryBoundaries,
  resetDiscoveryBoundaries,
} from '../../utils/nativeSyncBoundaries';
import { modelTransferFsBoundary } from '../../utils/modelTransferFsBoundary';
import { createDownloadedModel } from '../../utils/factories';

jest.mock('@react-navigation/native', () =>
  jest.requireActual('@react-navigation/native'),
);

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

jest.mock('react-native-fs', () => {
  const {
    modelTransferFsBoundary: boundary,
  } = require('../../utils/modelTransferFsBoundary');
  return {
    __esModule: true,
    default: boundary.module,
    ...boundary.module,
  };
});

interface ScreenshotEvent {
  syncId: string;
  name: string;
  mimeType: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  width: number;
  height: number;
}

const desktopDevice: DeviceInfo = {
  id: 'desktop-ambient-peer',
  name: 'Off Grid AI Desktop',
  platform: 'macos',
  version: '1',
  host: '127.0.0.1',
  port: 0,
};

describe('mobile ambient sharing journey', () => {
  let remote: ReturnType<typeof buildSyncEngine> | undefined;
  let ui: ReturnType<typeof render> | undefined;
  let screenshotListener: ((event: ScreenshotEvent) => void) | undefined;

  beforeEach(async () => {
    modelTransferFsBoundary.reset();
    resetDiscoveryBoundaries();
    await AsyncStorage.clear();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });
    registerSettingsSection(SyncSettingsSection);
    useAppStore.getState().setOnboardingComplete(true);
    useAppStore
      .getState()
      .setDownloadedModels([createDownloadedModel({ engine: 'litert' })]);
    useSyncStore.getState().reset();
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);

    NativeModules.SyncScreenshotModule = {
      setEnabled: jest.fn(),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    jest
      .spyOn(NativeEventEmitter.prototype, 'addListener')
      .mockImplementation((eventName, listener) => {
        if (eventName === 'SyncScreenshotCaptured') {
          screenshotListener = listener as (event: ScreenshotEvent) => void;
        }
        return { remove: jest.fn() } as unknown as EmitterSubscription;
      });
  });

  afterEach(async () => {
    await ambientShareService.setRule({
      source: 'screenshot',
      destinationId: desktopDevice.id,
      mode: 'off',
    });
    ui?.unmount();
    await remote?.engine.stop();
    await stateSyncService.stop();
    await syncService.stop();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    jest.restoreAllMocks();
  });

  it('asks before sending, survives a refusal, and lets the user retry successfully', async () => {
    const remoteRecords = new Map<string, Record<string, unknown>>();
    const receivedFiles: Array<{ name: string; bytes: Buffer }> = [];
    let rejectTransfers = false;
    let remoteState: StateSync;
    let remoteTransfers: FileTransferManager;

    const remoteLog = new OpLog({
      deviceId: desktopDevice.id,
      materializer: {
        put: (
          entity: string,
          entityId: string,
          fields: Record<string, unknown>,
        ) => remoteRecords.set(`${entity}:${entityId}`, fields),
        remove: (entity: string, entityId: string) =>
          remoteRecords.delete(`${entity}:${entityId}`),
      },
      uuid: (() => {
        let index = 0;
        return () => `desktop-ambient-op-${++index}`;
      })(),
      now: () => Date.now(),
    });

    remote = buildSyncEngine({
      localDevice: desktopDevice,
      tcpModule: TcpSocket as unknown as RnTcpModule,
      onMessage: (deviceId, message) => {
        remoteTransfers.handleMessage(deviceId, message);
      },
      onAppMessage: (deviceId, channel, data) => {
        if (channel === 'state') {
          remoteState.onMessage(deviceId, data as StateMsg);
        }
      },
    });
    remoteState = new StateSync({
      oplog: remoteLog,
      send: (deviceId, message) => {
        remote?.engine.sendApp(deviceId, 'state', message);
      },
    });
    remoteTransfers = new FileTransferManager({
      send: (deviceId, message) => remote!.engine.send(deviceId, message),
      createSink: async (
        _deviceId: string,
        request: FileRequestMessage,
      ): Promise<TransferFileSink | null> => {
        if (rejectTransfers || request.payload.mimeType !== SHARED_FILE_MIME) {
          return null;
        }
        const bytes = Buffer.alloc(request.payload.fileSize);
        return {
          prepare: async () => 0,
          write: async (offset, data) => {
            Buffer.from(data).copy(bytes, offset);
          },
          finalize: async () => {
            receivedFiles.push({
              name: request.payload.fileName,
              bytes,
            });
            return true;
          },
          abort: async () => undefined,
        };
      },
    });

    await remote.engine.start(0);
    desktopDevice.port = remote.transport.boundPort ?? 0;
    await sharedFileSyncService.start({
      recordStateMutation: mutation =>
        stateSyncService.recordMutation(mutation),
      requestStateSync: deviceId => stateSyncService.requestSync(deviceId),
    });
    await stateSyncService.start();
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
    await waitFor(() =>
      expect(
        within(ui!.getByTestId(`sync-paired-${desktopDevice.id}`)).getByText(
          /Connected/,
        ),
      ).toBeTruthy(),
    );

    fireEvent.press(ui.getByTestId(`ambient-destination-${desktopDevice.id}`));
    fireEvent.press(ui.getByTestId('ambient-screenshot-ask'));
    await waitFor(() => expect(screenshotListener).toBeDefined());

    const rejectedScreenshot = await captureScreenshot({
      syncId: '11111111-1111-4111-8111-111111111111',
      name: 'Screenshot-rejected.png',
      contents: 'not approved',
    });
    await waitFor(() => expect(ui!.getByText('Share this item?')).toBeTruthy());
    expect(
      remoteRecords.has(`${SHARED_FILE_ENTITY}:${rejectedScreenshot.syncId}`),
    ).toBe(false);
    expect(receivedFiles).toHaveLength(0);
    fireEvent.press(ui.getByTestId('ambient-share-reject'));
    await waitFor(() => expect(ui!.queryByText('Share this item?')).toBeNull());
    expect(
      ui.queryByTestId(`ambient-activity-${rejectedScreenshot.syncId}`),
    ).toBeNull();
    expect(receivedFiles).toHaveLength(0);

    rejectTransfers = true;
    const retriedScreenshot = await captureScreenshot({
      syncId: '22222222-2222-4222-8222-222222222222',
      name: 'Screenshot-retry.png',
      contents: 'share after recovery',
    });
    await waitFor(() => expect(ui!.getByText('Share this item?')).toBeTruthy());
    fireEvent.press(ui.getByTestId('ambient-share-accept'));

    await waitFor(() => {
      const failedActivity = ui!.getByTestId(
        `ambient-activity-${retriedScreenshot.syncId}`,
      );
      expect(within(failedActivity).getByText('Could not share')).toBeTruthy();
    });
    expect(receivedFiles).toHaveLength(0);

    rejectTransfers = false;
    fireEvent.press(
      ui.getByTestId(`ambient-retry-${retriedScreenshot.syncId}`),
    );
    await waitFor(() => expect(receivedFiles).toHaveLength(1));
    expect(receivedFiles[0]).toEqual({
      name: retriedScreenshot.name,
      bytes: Buffer.from('share after recovery'),
    });
    await waitFor(() =>
      expect(
        remoteRecords.has(`${SHARED_FILE_ENTITY}:${retriedScreenshot.syncId}`),
      ).toBe(true),
    );
    expect(
      ui.queryByTestId(`ambient-activity-${retriedScreenshot.syncId}`),
    ).toBeNull();
  });

  async function captureScreenshot(options: {
    syncId: string;
    name: string;
    contents: string;
  }): Promise<ScreenshotEvent> {
    const filePath = `${modelTransferFsBoundary.DocumentDirectoryPath}/sync_screenshots/${options.name}`;
    await modelTransferFsBoundary.module.writeFile(
      filePath,
      options.contents,
      'utf8',
    );
    const event: ScreenshotEvent = {
      syncId: options.syncId,
      name: options.name,
      mimeType: 'image/png',
      filePath,
      fileSize: Buffer.byteLength(options.contents),
      createdAt: '2026-07-28T10:00:00.000Z',
      width: 1179,
      height: 2556,
    };
    screenshotListener?.(event);
    return event;
  }
});
