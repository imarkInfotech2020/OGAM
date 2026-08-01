import { Buffer } from 'buffer';
import { installRealSqlite } from '../../harness/sqliteFake';
import {
  installNativeBoundary,
  requireRTL,
} from '../../harness/nativeBoundary';

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

jest.mock('react-native-fs', () => {
  const {
    modelTransferFsBoundary,
  } = require('../../utils/modelTransferFsBoundary');
  return {
    __esModule: true,
    default: modelTransferFsBoundary.module,
    ...modelTransferFsBoundary.module,
  };
});

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('Pro mobile knowledge document sync journey', () => {
  it('stages file-first input, indexes it visibly, sends a picked file back, and applies a tombstone', async () => {
    const globals = globalThis as unknown as {
      Buffer: typeof Buffer | undefined;
    };
    const previousGlobalBuffer = globals.Buffer;
    globals.Buffer = undefined;
    installNativeBoundary({ llama: true });
    installRealSqlite();
    const React = require('react');
    const rtl = requireRTL();
    const { NavigationContainer } = require('@react-navigation/native');
    const asyncStorageModule = require('@react-native-async-storage/async-storage');
    const AsyncStorage = asyncStorageModule.default ?? asyncStorageModule;
    const Keychain = require('react-native-keychain');
    const TcpSocket = require('react-native-tcp-socket').default;
    const RNFS = require('react-native-fs').default;
    const picker = require('@react-native-documents/picker');
    const {
      FileTransferManager,
      IncrementalChecksum,
      KNOWLEDGE_DOCUMENT_ENTITY,
      KNOWLEDGE_DOCUMENT_MIME,
      OpLog,
      StateSync,
      createKnowledgeDocumentStateFields,
      createKnowledgeDocumentTransferMetadata,
    } = require('@offgrid/sync');
    const { AppNavigator } = require('../../../src/navigation/AppNavigator');
    const {
      HOOKS,
      _clearHooksForTesting,
      registerHook,
    } = require('../../../src/bootstrap/hookRegistry');
    const { useAppStore } = require('../../../src/stores/appStore');
    const { useChatStore } = require('../../../src/stores/chatStore');
    const { ragService } = require('../../../src/services/rag');
    const { buildSyncEngine } = require('../../../src/services/sync/engine');
    const {
      knowledgeDocumentSyncService,
    } = require('../../../pro/sync/knowledgeDocumentSyncService');
    const { stateSyncService } = require('../../../pro/sync/stateSyncService');
    const { syncService } = require('../../../pro/sync/syncService');
    const { useSyncStore } = require('../../../pro/sync/syncStore');
    const {
      getDiscoveryBoundaries,
      resetDiscoveryBoundaries,
    } = require('../../utils/nativeSyncBoundaries');
    const {
      modelTransferFsBoundary,
    } = require('../../utils/modelTransferFsBoundary');
    const { createDownloadedModel } = require('../../utils/factories');

    const remoteProjectId = '11111111-1111-4111-8111-111111111111';
    const remoteDocumentId = '22222222-2222-4222-8222-222222222222';
    const createdAt = '2026-07-28T08:00:00.000Z';
    const remoteBytes = Buffer.from(
      'The OGAD launch brief says the private beta begins on Thursday.',
    );
    const remoteDescriptor = {
      syncId: remoteDocumentId,
      projectId: remoteProjectId,
      name: 'launch-brief.txt',
      createdAt,
      enabled: true,
    };
    const receivedByDesktop: Array<{
      request: Record<string, any>;
      bytes: Buffer;
    }> = [];
    const renderApp = () =>
      rtl.render(
        React.createElement(
          NavigationContainer,
          null,
          React.createElement(AppNavigator),
        ),
      );

    modelTransferFsBoundary.reset();
    await RNFS.writeFile(
      `${RNFS.MainBundlePath}/all-MiniLM-L6-v2-Q8_0.gguf`,
      'native embedding model fixture',
      'utf8',
    );
    resetDiscoveryBoundaries();
    await AsyncStorage.clear();
    _clearHooksForTesting();
    useSyncStore.getState().reset();
    useChatStore.getState().clearAllConversations();
    useAppStore.getState().setOnboardingComplete(true);
    // Pro is an entitlement the app is told about, so it is seeded like any other outside fact.
    useAppStore.getState().setProActive(true);
    useAppStore
      .getState()
      .setDownloadedModels([createDownloadedModel({ engine: 'litert' })]);
    Keychain.getGenericPassword.mockResolvedValue(false);
    Keychain.setGenericPassword.mockResolvedValue(true);

    const remoteDevice = {
      id: 'desktop-knowledge-peer',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    const remoteRecords = new Map<string, Record<string, unknown>>();
    const remoteLog = new OpLog({
      deviceId: remoteDevice.id,
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
        return () => `desktop-knowledge-op-${++index}`;
      })(),
      now: () => Date.now(),
    });
    let remoteState: InstanceType<typeof StateSync>;
    let remoteTransfers: InstanceType<typeof FileTransferManager>;
    const remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: TcpSocket,
      onMessage: (deviceId: string, message: Record<string, unknown>) => {
        remoteTransfers.handleMessage(deviceId, message);
      },
      onAppMessage: (deviceId: string, channel: string, data: unknown) => {
        if (channel === 'state') remoteState.onMessage(deviceId, data);
      },
    });
    remoteState = new StateSync({
      oplog: remoteLog,
      send: (deviceId: string, message: unknown) => {
        remote.engine.sendApp(deviceId, 'state', message);
      },
    });
    remoteTransfers = new FileTransferManager({
      send: (deviceId: string, message: Record<string, unknown>) =>
        remote.engine.send(deviceId, message),
      createSink: async (_deviceId: string, request: Record<string, any>) => {
        if (request.payload.mimeType !== KNOWLEDGE_DOCUMENT_MIME) return null;
        const bytes = Buffer.alloc(request.payload.fileSize);
        return {
          prepare: async () => 0,
          write: async (offset: number, data: Uint8Array) => {
            Buffer.from(data).copy(bytes, offset);
          },
          finalize: async () => {
            receivedByDesktop.push({ request, bytes });
            return true;
          },
          abort: async () => undefined,
        };
      },
    });

    registerHook(HOOKS.syncRecordLocalMutation, (mutation: unknown) => {
      stateSyncService.recordMutation(mutation);
    });
    registerHook(HOOKS.syncKnowledgeDocumentMutation, (mutation: unknown) => {
      knowledgeDocumentSyncService
        .handleLocalMutation(mutation)
        .catch(() => undefined);
    });
    knowledgeDocumentSyncService.start({
      recordStateMutation: (mutation: unknown) =>
        stateSyncService.recordMutation(mutation),
      canShareDocuments: () => stateSyncService.preferences().projects,
    });

    let view: ReturnType<typeof rtl.render> | undefined;
    try {
      await remote.engine.start(0);
      remoteDevice.port = remote.transport.boundPort ?? 0;
      await stateSyncService.start();
      await syncService.start();

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
      await waitForCondition(
        () =>
          useSyncStore
            .getState()
            .pairingAttempts.some(
              (attempt: {
                device: { id: string };
                direction: string;
                stage: string;
              }) =>
                attempt.device.id === remoteDevice.id &&
                attempt.direction === 'incoming' &&
                attempt.stage === 'waiting_for_confirmation',
            ),
        'Mobile did not receive the Desktop pairing request',
      );
      syncService.acceptIncomingPairing('blue-otter-42');
      await pairing;
      await waitForCondition(
        () =>
          remote.engine.isPaired(mobile.id) &&
          useSyncStore
            .getState()
            .knownDevices.some(
              (device: { id: string; status: string }) =>
                device.id === remoteDevice.id && device.status === 'connected',
            ),
        'Mobile and Desktop did not reach connected state',
      );

      const remoteChecksum = new IncrementalChecksum();
      remoteChecksum.update(remoteBytes);
      await remoteTransfers.sendFile(mobile.id, {
        fileName: remoteDescriptor.name,
        fileSize: remoteBytes.length,
        mimeType: KNOWLEDGE_DOCUMENT_MIME,
        metadata: createKnowledgeDocumentTransferMetadata(remoteDescriptor),
        checksum: async () => remoteChecksum.digest(),
        read: async (offset: number, length: number) =>
          new Uint8Array(remoteBytes.subarray(offset, offset + length)),
      });
      expect(await ragService.getAllDocumentsForSync()).toHaveLength(0);

      const projectOp = remoteLog.record('project', remoteProjectId, 'put', {
        name: 'OGAD',
        description: 'Launch documents',
        system_prompt: 'Use the launch brief.',
        icon: null,
        include_memory: 1,
        created_at: createdAt,
        updated_at: createdAt,
      });
      const documentOp = remoteLog.record(
        KNOWLEDGE_DOCUMENT_ENTITY,
        remoteDocumentId,
        'put',
        createKnowledgeDocumentStateFields(remoteDescriptor),
      );
      remote.engine.sendApp(mobile.id, 'state', {
        t: 'ops',
        ops: [documentOp, projectOp],
      });

      await waitForCondition(
        async () => (await ragService.getAllDocumentsForSync()).length === 1,
        'Mobile did not index the streamed Desktop document',
      );
      expect(await ragService.getDocumentsByProject(remoteProjectId)).toEqual([
        expect.objectContaining({
          name: 'launch-brief.txt',
          project_id: remoteProjectId,
          sync_id: remoteDocumentId,
        }),
      ]);

      view = renderApp();
      rtl.fireEvent.press(view.getByTestId('projects-tab'));
      await rtl.waitFor(() => {
        expect(view!.queryByText('OGAD')).not.toBeNull();
      });
      rtl.fireEvent.press(view.getByText('OGAD'));
      await rtl.waitFor(() => {
        expect(view!.queryByText('launch-brief.txt')).not.toBeNull();
        expect(view!.queryByLabelText('Use launch-brief.txt')).not.toBeNull();
        expect(
          view!.queryByLabelText('Remove launch-brief.txt'),
        ).not.toBeNull();
      });

      await RNFS.writeFile(
        '/docs/phone-notes.txt',
        'The phone note confirms the Thursday beta and the Friday review.',
        'utf8',
      );
      picker.pick.mockResolvedValue([
        {
          uri: 'file:///docs/phone-notes.txt',
          name: 'phone-notes.txt',
          type: 'text/plain',
          size: 65,
        },
      ]);
      rtl.fireEvent.press(view.getByText('Add'));
      await rtl.waitFor(
        () => {
          expect(view!.queryByText('phone-notes.txt')).not.toBeNull();
          expect(view!.queryByLabelText('Use phone-notes.txt')).not.toBeNull();
          expect(
            view!.queryByLabelText('Remove phone-notes.txt'),
          ).not.toBeNull();
        },
        { timeout: 6000 },
      );
      await waitForCondition(
        () =>
          receivedByDesktop.some(
            transfer =>
              transfer.request.payload.metadata.name === 'phone-notes.txt',
          ),
        'Desktop did not receive the phone knowledge document',
      );
      const phoneTransfer = receivedByDesktop.find(
        transfer =>
          transfer.request.payload.metadata.name === 'phone-notes.txt',
      );
      expect(phoneTransfer?.bytes.toString('utf8')).toContain('Thursday beta');
      expect(
        [...remoteRecords.entries()].some(
          ([key, fields]) =>
            key.startsWith(`${KNOWLEDGE_DOCUMENT_ENTITY}:`) &&
            fields.name === 'phone-notes.txt',
        ),
      ).toBe(true);

      const deleteOp = remoteLog.record(
        KNOWLEDGE_DOCUMENT_ENTITY,
        remoteDocumentId,
        'delete',
      );
      remote.engine.sendApp(mobile.id, 'state', {
        t: 'ops',
        ops: [deleteOp],
      });
      await waitForCondition(
        async () =>
          !(
            await ragService.getAllDocumentsForSync()
          ).some(
            (document: { syncId: string }) =>
              document.syncId === remoteDocumentId,
          ),
        'Mobile did not apply the Desktop knowledge tombstone',
      );
      rtl.fireEvent.press(view.getByLabelText('Back'));
      await rtl.waitFor(() => {
        expect(view!.queryByText('OGAD')).not.toBeNull();
      });
      rtl.fireEvent.press(view.getByText('OGAD'));
      await rtl.waitFor(() => {
        expect(view!.queryByText('launch-brief.txt')).toBeNull();
        expect(view!.queryByText('phone-notes.txt')).not.toBeNull();
      });
    } finally {
      globals.Buffer = previousGlobalBuffer;
      view?.unmount();
      _clearHooksForTesting();
      await remoteTransfers.dispose();
      await knowledgeDocumentSyncService.stop();
      await stateSyncService.stop();
      await remote.engine.stop();
      await syncService.stop();
    }
  });
});
