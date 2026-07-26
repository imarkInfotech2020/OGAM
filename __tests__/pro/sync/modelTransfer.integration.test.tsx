import React from 'react';
import {
  fireEvent,
  render,
  waitFor as waitForRender,
} from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: jest.fn() }),
}));

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

const waitForCondition = async (
  condition: () => boolean,
  timeoutMs = 3000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for Sync state');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

describe('Pro mobile model transfer journey', () => {
  it('receives, registers, and sends an encrypted GGUF through the rendered Sync journey', async () => {
    const {
      modelTransferFsBoundary: boundary,
    } = require('../../utils/modelTransferFsBoundary');
    boundary.reset();
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const Keychain = require('react-native-keychain');
    const TcpSocket = require('react-native-tcp-socket').default;
    const {
      FileTransferManager,
      IncrementalChecksum,
      MODEL_TRANSFER_MIME,
    } = require('@offgrid/sync');
    const { buildSyncEngine } = require('../../../src/services/sync/engine');
    const { syncService } = require('../../../pro/sync/syncService');
    const {
      modelTransferService,
    } = require('../../../pro/sync/modelTransferService');
    const { SyncScreen } = require('../../../pro/ui/SyncScreen');
    const { useSyncStore } = require('../../../pro/sync/syncStore');
    const { modelManager } = require('../../../src/services/modelManager');
    const {
      getDiscoveryBoundaries,
      resetDiscoveryBoundaries,
    } = require('../../utils/nativeSyncBoundaries');

    await AsyncStorage.clear();
    resetDiscoveryBoundaries();
    Keychain.getGenericPassword.mockResolvedValue(false);
    Keychain.setGenericPassword.mockResolvedValue(true);

    let remoteTransfers: InstanceType<typeof FileTransferManager> | undefined;
    const remoteDevice = {
      id: 'desktop-model-source',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    const remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: TcpSocket,
      onMessage: (deviceId: string, message: unknown) => {
        remoteTransfers?.handleMessage(deviceId, message);
      },
    });
    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;

    modelTransferService.start();
    await syncService.start();
    const mobile = useSyncStore.getState().thisDevice;
    const discovery = getDiscoveryBoundaries().at(-1);
    expect(mobile).toBeDefined();
    expect(discovery?.publishedPort).toBeGreaterThan(0);
    useSyncStore.getState().setPairingCode('green-river-52');

    await remote.engine.pair(
      { ...mobile, host: '127.0.0.1', port: discovery.publishedPort },
      'green-river-52',
    );
    await waitForCondition(() =>
      useSyncStore
        .getState()
        .paired.some((device: { id: string }) => device.id === remoteDevice.id),
    );

    const payload = Buffer.alloc(96 * 1024 + 4, 0x5a);
    payload.write('GGUF', 0, 'ascii');
    const checksum = new IncrementalChecksum();
    checksum.update(payload);
    const fileName = 'gemma-mobile-Q4_K_M.gguf';
    let returnedModel: Buffer | undefined;
    let returnedFileName: string | undefined;
    remoteTransfers = new FileTransferManager({
      send: (deviceId: string, message: unknown) =>
        remote.engine.send(deviceId, message),
      createSink: async (
        _deviceId: string,
        request: {
          payload: {
            fileName: string;
            fileSize: number;
            checksum: string;
          };
        },
      ) => {
        const received = Buffer.alloc(request.payload.fileSize);
        return {
          prepare: async () => 0,
          write: async (offset: number, data: Uint8Array) => {
            Buffer.from(data).copy(received, offset);
          },
          finalize: async () => {
            const receivedChecksum = new IncrementalChecksum();
            receivedChecksum.update(received);
            if (receivedChecksum.digest() !== request.payload.checksum) {
              return false;
            }
            returnedModel = received;
            returnedFileName = request.payload.fileName;
            return true;
          },
          abort: async () => undefined,
        };
      },
    });

    await remoteTransfers.sendFile(mobile.id, {
      fileName,
      fileSize: payload.length,
      mimeType: MODEL_TRANSFER_MIME,
      metadata: {
        type: 'offgrid-model',
        version: 1,
        manifest: {
          id: 'google/gemma-mobile',
          name: 'Gemma Mobile',
          kind: 'text',
          source: 'downloaded',
          files: [{ name: fileName, sizeBytes: payload.length }],
        },
      },
      checksum: async () => checksum.digest(),
      read: async (offset: number, length: number) =>
        new Uint8Array(payload.subarray(offset, offset + length)),
    });

    const models = await modelManager.getDownloadedModels();
    expect(models).toEqual([
      expect.objectContaining({
        id: `google/gemma-mobile/${fileName}`,
        name: 'Gemma Mobile',
        author: 'google',
        engine: 'llama',
        fileName,
        fileSize: payload.length,
      }),
    ]);
    expect(
      await boundary.readAscii(
        `${boundary.DocumentDirectoryPath}/models/${fileName}`,
        4,
        0,
      ),
    ).toBe('GGUF');

    const invalidPayload = Buffer.alloc(4096, 0x58);
    const invalidChecksum = new IncrementalChecksum();
    invalidChecksum.update(invalidPayload);
    const invalidFileName = 'not-really-a-model.gguf';
    await expect(
      remoteTransfers.sendFile(mobile.id, {
        fileName: invalidFileName,
        fileSize: invalidPayload.length,
        mimeType: MODEL_TRANSFER_MIME,
        metadata: {
          type: 'offgrid-model',
          version: 1,
          manifest: {
            id: 'offgrid/invalid-model',
            name: 'Invalid model',
            kind: 'text',
            source: 'downloaded',
            files: [
              { name: invalidFileName, sizeBytes: invalidPayload.length },
            ],
          },
        },
        checksum: async () => invalidChecksum.digest(),
        read: async (offset: number, length: number) =>
          new Uint8Array(invalidPayload.subarray(offset, offset + length)),
      }),
    ).rejects.toThrow('receiver could not verify or register the file');
    expect(await modelManager.getDownloadedModels()).toHaveLength(1);
    expect(
      await boundary.exists(
        `${boundary.DocumentDirectoryPath}/models/${invalidFileName}`,
      ),
    ).toBe(false);
    expect(
      await boundary.exists(
        `${boundary.DocumentDirectoryPath}/models/${invalidFileName}.part`,
      ),
    ).toBe(false);

    const ui = render(<SyncScreen />);
    fireEvent.press(ui.getByTestId(`sync-send-model-${remoteDevice.id}`));
    await waitForRender(() =>
      expect(
        ui.getByTestId(`transfer-model-google/gemma-mobile/${fileName}`),
      ).toBeTruthy(),
    );
    fireEvent.press(ui.getByTestId('send-selected-model'));

    await waitForRender(
      () =>
        expect(
          ui.getByText(`Gemma Mobile is available on ${remoteDevice.name}.`),
        ).toBeTruthy(),
      { timeout: 5000 },
    );
    expect(returnedFileName).toBe(fileName);
    expect(returnedModel).toEqual(payload);
    expect(ui.getAllByText(`Sent ${fileName}`).length).toBeGreaterThanOrEqual(
      1,
    );
    ui.unmount();

    const transferredModelId = `google/gemma-mobile/${fileName}`;
    for (let index = 0; index < 21; index += 1) {
      await expect(
        modelTransferService.sendModel(
          `offline-device-${index}`,
          transferredModelId,
        ),
      ).rejects.toThrow('device is not connected');
    }
    expect(modelTransferService.getProgressSnapshot()).toHaveLength(20);

    await remoteTransfers.dispose();
    await remote.engine.stop();
    await syncService.stop();
    await modelTransferService.stop();
  });
});
