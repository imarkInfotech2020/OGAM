import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import TcpSocket from 'react-native-tcp-socket';
import {
  OpLog,
  StateSync,
  type DeviceInfo,
  type Materializer,
} from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import { AppNavigator } from '../../../src/navigation/AppNavigator';
import {
  registerScreen,
  _clearScreensForTesting,
} from '../../../src/navigation/screenRegistry';
import {
  registerSettingsSection,
  _clearSectionsForTesting,
} from '../../../src/components/settings/sectionRegistry';
import {
  HOOKS,
  _clearHooksForTesting,
  registerHook,
} from '../../../src/bootstrap/hookRegistry';
import { useAppStore } from '../../../src/stores/appStore';
import { useChatStore } from '../../../src/stores/chatStore';
import { useProjectStore } from '../../../src/stores/projectStore';
import { buildSyncEngine } from '../../../src/services/sync/engine';
import {
  CORE_SYNC_ENTITIES,
  type SyncMutation,
} from '../../../src/services/sync/mutation';
import { syncService } from '../../../pro/sync/syncService';
import { stateSyncService } from '../../../pro/sync/stateSyncService';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { SyncSettingsSection } from '../../../pro/ui/SyncSettingsSection';
import {
  getDiscoveryBoundaries,
  resetDiscoveryBoundaries,
} from '../../utils/nativeSyncBoundaries';
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

const nativeTcpBoundary = TcpSocket as unknown as RnTcpModule;

class RemoteRecords implements Materializer {
  readonly records = new Map<string, Record<string, unknown>>();

  put(entity: string, entityId: string, fields: Record<string, unknown>): void {
    this.records.set(`${entity}:${entityId}`, fields);
  }

  remove(entity: string, entityId: string): void {
    this.records.delete(`${entity}:${entityId}`);
  }
}

describe('Pro mobile state sync journey', () => {
  let remote: ReturnType<typeof buildSyncEngine> | undefined;
  let ui: ReturnType<typeof render> | undefined;

  beforeEach(async () => {
    _clearHooksForTesting();
    await stateSyncService.stop();
    await syncService.stop();
    await AsyncStorage.clear();
    resetDiscoveryBoundaries();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });
    registerSettingsSection(SyncSettingsSection);
    useAppStore.getState().setOnboardingComplete(true);
    useAppStore
      .getState()
      .setDownloadedModels([createDownloadedModel({ engine: 'litert' })]);
    useSyncStore.getState().reset();
    useChatStore.getState().clearAllConversations();
    for (const project of useProjectStore.getState().projects) {
      useProjectStore.getState().deleteProject(project.id);
    }
    registerHook(HOOKS.syncRecordLocalMutation, (mutation: SyncMutation) => {
      stateSyncService.recordMutation(mutation);
    });
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  });

  afterEach(async () => {
    ui?.unmount();
    _clearHooksForTesting();
    await stateSyncService.stop();
    await remote?.engine.stop();
    await syncService.stop();
    _clearScreensForTesting();
    _clearSectionsForTesting();
  });

  it('converges state and honors visible sharing controls through the rendered app', async () => {
    const remoteDevice: DeviceInfo = {
      id: 'desktop-state-peer',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    const remoteRecords = new RemoteRecords();
    let opIndex = 0;
    const remoteLog = new OpLog({
      deviceId: remoteDevice.id,
      materializer: remoteRecords,
      uuid: () => `desktop-op-${++opIndex}`,
      now: () => Date.now(),
    });
    let remoteState: StateSync;
    remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      onPaired: device => remoteState.onConnect(device.id),
      onAppMessage: (deviceId, channel, data) => {
        if (channel === 'state') remoteState.onMessage(deviceId, data);
      },
    });
    remoteState = new StateSync({
      oplog: remoteLog,
      send: (deviceId, message) => {
        remote!.engine.sendApp(deviceId, 'state', message);
      },
    });

    const createdAt = '2026-07-27T12:00:00.000Z';
    remoteLog.record(CORE_SYNC_ENTITIES.project, 'remote-project', 'put', {
      name: 'Desktop Research',
      description: 'Notes created before pairing',
      system_prompt: 'Keep the research grounded.',
      icon: null,
      include_memory: 1,
      created_at: createdAt,
      updated_at: createdAt,
    });
    remoteLog.record(
      CORE_SYNC_ENTITIES.conversation,
      'remote-conversation',
      'put',
      {
        title: 'Field planning',
        project_id: 'remote-project',
        created_at: createdAt,
        updated_at: createdAt,
      },
    );
    remoteLog.record(CORE_SYNC_ENTITIES.message, 'remote-message', 'put', {
      conversation_id: 'remote-conversation',
      role: 'user',
      content: 'Bring the field notes',
      context: null,
      created_at: createdAt,
    });
    for (let revision = 0; revision < 20; revision += 1) {
      remoteLog.record(CORE_SYNC_ENTITIES.modelSetting, 'temperature', 'put', {
        value_json: revision === 19 ? '0.55' : '0.5',
      });
    }

    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;
    await stateSyncService.start();
    await syncService.start();

    ui = render(
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>,
    );
    fireEvent.press(ui.getByTestId('settings-tab'));
    fireEvent.press(await waitFor(() => ui!.getByTestId('open-sync-settings')));
    fireEvent.changeText(ui.getByTestId('sync-pairing-code'), 'violet-lake-27');

    const mobile = useSyncStore.getState().thisDevice;
    const discovery = getDiscoveryBoundaries().at(-1);
    if (!mobile || !discovery?.publishedPort) {
      throw new Error('Sync did not publish the mobile device');
    }
    await remote.engine.pair(
      { ...mobile, host: '127.0.0.1', port: discovery.publishedPort },
      'violet-lake-27',
    );
    await waitFor(() =>
      expect(ui!.getByTestId(`sync-paired-${remoteDevice.id}`)).toBeTruthy(),
    );

    fireEvent(ui.getByTestId('sync-projects-toggle'), 'valueChange', false);
    await waitFor(() =>
      expect(stateSyncService.preferences().projects).toBe(false),
    );

    fireEvent.press(ui.getByLabelText('Back'));
    fireEvent.press(await waitFor(() => ui!.getByTestId('projects-tab')));
    await waitFor(() => expect(ui!.getByText('Desktop Research')).toBeTruthy());
    fireEvent.press(ui.getByTestId('chats-tab'));
    await waitFor(() => expect(ui!.getByText('Field planning')).toBeTruthy());
    expect(ui.getByText('You: Bring the field notes')).toBeTruthy();
    expect(ui.getByText('Desktop Research')).toBeTruthy();

    fireEvent.press(ui.getByTestId('projects-tab'));
    fireEvent.press(ui.getByText('New'));
    fireEvent.changeText(
      ui.getByPlaceholderText('e.g., Spanish Learning, Code Review'),
      'Phone Notes',
    );
    fireEvent.changeText(
      ui.getByPlaceholderText(
        'Enter the instructions or context for the AI...',
      ),
      'Keep these notes concise.',
    );
    fireEvent.press(ui.getByText('Save'));

    const phoneProject = useProjectStore
      .getState()
      .projects.find(project => project.name === 'Phone Notes');
    if (!phoneProject) throw new Error('Phone project was not saved');
    expect(
      remoteRecords.records.has(
        `${CORE_SYNC_ENTITIES.project}:${phoneProject.id}`,
      ),
    ).toBe(false);

    fireEvent.press(ui.getByTestId('settings-tab'));
    fireEvent.press(await waitFor(() => ui!.getByTestId('open-sync-settings')));
    fireEvent(ui.getByTestId('sync-projects-toggle'), 'valueChange', true);

    await waitFor(() =>
      expect(
        remoteRecords.records.get(
          `${CORE_SYNC_ENTITIES.project}:${phoneProject.id}`,
        ),
      ).toMatchObject({ name: 'Phone Notes' }),
    );

    fireEvent(ui.getByTestId('sync-settings-toggle'), 'valueChange', false);
    await waitFor(() =>
      expect(stateSyncService.preferences().settings).toBe(false),
    );
    fireEvent.press(ui.getByLabelText('Back'));
    fireEvent.press(ui.getByText('Model Settings'));
    fireEvent.press(
      await waitFor(() => ui!.getByTestId('text-generation-accordion')),
    );
    await waitFor(() =>
      expect(ui!.getByTestId('llama-temperature-value').props.children).toBe(
        '0.55',
      ),
    );
    fireEvent(
      ui.getByTestId('llama-temperature-slider'),
      'slidingComplete',
      1.25,
    );
    expect(
      remoteRecords.records.get(
        `${CORE_SYNC_ENTITIES.modelSetting}:temperature`,
      ),
    ).toMatchObject({ value_json: '0.55' });

    fireEvent.press(ui.getByLabelText('Back'));
    fireEvent.press(await waitFor(() => ui!.getByTestId('open-sync-settings')));
    fireEvent(ui.getByTestId('sync-settings-toggle'), 'valueChange', true);
    await waitFor(() =>
      expect(
        remoteRecords.records.get(
          `${CORE_SYNC_ENTITIES.modelSetting}:temperature`,
        ),
      ).toMatchObject({ value_json: '1.25' }),
    );
  });
});
