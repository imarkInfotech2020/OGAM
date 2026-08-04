import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import TcpSocket from 'react-native-tcp-socket';
import {
  FileTransferManager,
  IncrementalChecksum,
  MODEL_TRANSFER_MIME,
  type DeviceInfo,
} from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import { AppNavigator } from '../../../src/navigation/AppNavigator';
import {
  registerScreen,
  _clearScreensForTesting,
} from '../../../src/navigation/screenRegistry';
import { _clearSectionsForTesting } from '../../../src/components/settings/sectionRegistry';
import { useAppStore } from '../../../src/stores/appStore';
import { modelManager } from '../../../src/services/modelManager';
import { buildSyncEngine } from '../../../src/services/sync/engine';
import { syncService } from '../../../pro/sync/syncService';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { modelTransferService } from '../../../pro/sync/modelTransferService';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { SyncActivityScreen } from '../../../pro/ui/SyncScreen/SyncActivityScreen';
import { ProRoot } from '../../../pro/ui/ProRoot';
import {
  getDiscoveryBoundaries,
  resetDiscoveryBoundaries,
} from '../../utils/nativeSyncBoundaries';
import { modelTransferFsBoundary } from '../../utils/modelTransferFsBoundary';
import {
  createDownloadedModel,
  createVisionModel,
} from '../../utils/factories';
import { ModelTransferSheet } from '../../../pro/ui/ModelTransferSheet';
import { pairingCodeOnScreen } from '../../utils/pairFromPeer';
import { createLicensedMesh } from '../../harness/licensedMesh';

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
    modelTransferFsBoundary: boundary,
  } = require('../../utils/modelTransferFsBoundary');
  return {
    __esModule: true,
    default: boundary.module,
    ...boundary.module,
  };
});

const nativeTcpBoundary = TcpSocket as unknown as RnTcpModule;

/** Two devices that can pair: an in-memory licence provider, and a licensed peer to pair with. */
const mesh = createLicensedMesh();

describe('Pro mobile model transfer journey', () => {
  let remote: ReturnType<typeof buildSyncEngine> | undefined;
  let remoteTransfers: FileTransferManager | undefined;
  let ui: ReturnType<typeof render> | undefined;

  beforeEach(async () => {
    mesh.reset();
    modelTransferFsBoundary.reset();
    await AsyncStorage.clear();
    resetDiscoveryBoundaries();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });
    registerScreen({ name: 'SyncActivity', component: SyncActivityScreen });
    useAppStore.getState().setOnboardingComplete(true);
    // Pro is an entitlement the app is told about, so it is seeded like any other outside fact.
    useAppStore.getState().setProActive(true);
    useAppStore
      .getState()
      .setDownloadedModels([createDownloadedModel({ engine: 'litert' })]);
    useSyncStore.getState().reset();
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  });

  afterEach(async () => {
    mesh.restore();
    ui?.unmount();
    await remoteTransfers?.dispose();
    await remote?.engine.stop();
    await syncService.stop();
    await modelTransferService.stop();
    _clearScreensForTesting();
    _clearSectionsForTesting();
  });

  it('receives, rejects, and sends a GGUF through Settings to Sync', async () => {
    const remoteDevice: DeviceInfo = {
      id: 'desktop-model-source',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    let returnedModel: Buffer | undefined;
    let returnedFileName: string | undefined;

    remote = buildSyncEngine({
      pairingEntitlement: mesh.peer(),
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      onMessage: (deviceId, message) => {
        remoteTransfers?.handleMessage(deviceId, message);
      },
    });
    remoteTransfers = new FileTransferManager({
      send: (deviceId, message) => remote!.engine.send(deviceId, message),
      createSink: async (_deviceId, request) => {
        const received = Buffer.alloc(request.payload.fileSize);
        return {
          prepare: async () => 0,
          write: async (offset: number, data: Uint8Array) => {
            Buffer.from(data).copy(received, offset);
          },
          finalize: async () => {
            const checksum = new IncrementalChecksum();
            checksum.update(received);
            if (checksum.digest() !== request.payload.checksum) return false;
            returnedModel = received;
            returnedFileName = request.payload.fileName;
            return true;
          },
          abort: async () => undefined,
        };
      },
    });

    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;
    modelTransferService.start();
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
      expect(ui!.getByText('Discoverable')).toBeTruthy(),
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
      await pairingCodeOnScreen(ui),
    );
    await waitFor(() =>
      expect(ui!.getByTestId('pairing-attempt-sheet')).toBeTruthy(),
    );
    await pairing;
    await waitFor(() =>
      expect(ui!.getByTestId(`sync-paired-${remoteDevice.id}`)).toBeTruthy(),
    );

    const payload = Buffer.alloc(96 * 1024 + 4, 0x5a);
    payload.write('GGUF', 0, 'ascii');
    const checksum = new IncrementalChecksum();
    checksum.update(payload);
    const fileName = 'gemma-mobile-Q4_K_M.gguf';
    await remoteTransfers.sendFile(mobile.id, {
      fileName,
      fileSize: payload.length,
      mimeType: MODEL_TRANSFER_MIME,
      metadata: {
        type: 'offgrid-model',
        version: 2,
        packageId: 'text-package',
        fileIndex: 0,
        manifest: {
          id: 'google/gemma-mobile',
          name: 'Gemma Mobile',
          kind: 'text',
          source: 'downloaded',
          files: [
            {
              name: fileName,
              sizeBytes: payload.length,
              role: 'primary',
            },
          ],
        },
      },
      checksum: async () => checksum.digest(),
      read: async (offset, length) =>
        new Uint8Array(payload.subarray(offset, offset + length)),
    });

    fireEvent.press(ui.getByTestId('sync-open-activity'));
    await waitFor(() => expect(ui!.getByText(fileName)).toBeTruthy());
    expect(ui.getByText('Received')).toBeTruthy();
    await expect(modelManager.getDownloadedModels()).resolves.toEqual([
      expect.objectContaining({
        id: `google/gemma-mobile/${fileName}`,
        name: 'Gemma Mobile',
        author: 'google',
        engine: 'llama',
        fileName,
        fileSize: payload.length,
      }),
    ]);
    await expect(
      modelTransferFsBoundary.readAscii(
        `${modelTransferFsBoundary.DocumentDirectoryPath}/models/${fileName}`,
        4,
        0,
      ),
    ).resolves.toBe('GGUF');

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
          version: 2,
          packageId: 'invalid-package',
          fileIndex: 0,
          manifest: {
            id: 'offgrid/invalid-model',
            name: 'Invalid model',
            kind: 'text',
            source: 'downloaded',
            files: [
              {
                name: invalidFileName,
                sizeBytes: invalidPayload.length,
                role: 'primary',
              },
            ],
          },
        },
        checksum: async () => invalidChecksum.digest(),
        read: async (offset, length) =>
          new Uint8Array(invalidPayload.subarray(offset, offset + length)),
      }),
    ).rejects.toThrow('receiver could not verify or register the file');
    await waitFor(() => expect(ui!.getByText(invalidFileName)).toBeTruthy());
    expect(ui.getByText('Could not receive')).toBeTruthy();
    await expect(modelManager.getDownloadedModels()).resolves.toHaveLength(1);
    await expect(
      modelTransferFsBoundary.exists(
        `${modelTransferFsBoundary.DocumentDirectoryPath}/models/${invalidFileName}`,
      ),
    ).resolves.toBe(false);
    await expect(
      modelTransferFsBoundary.exists(
        `${modelTransferFsBoundary.DocumentDirectoryPath}/models/${invalidFileName}.part`,
      ),
    ).resolves.toBe(false);

    fireEvent.press(ui.getByLabelText('Back'));
    fireEvent.press(ui.getByTestId(`sync-send-model-${remoteDevice.id}`));
    await waitFor(() =>
      expect(
        ui!.getByTestId(`transfer-model-google/gemma-mobile/${fileName}`),
      ).toBeTruthy(),
    );
    fireEvent.press(ui.getByTestId('send-selected-model'));

    await waitFor(
      () =>
        expect(
          ui!.getByText(`Gemma Mobile is available on ${remoteDevice.name}.`),
        ).toBeTruthy(),
      { timeout: 5000 },
    );
    expect(returnedFileName).toBe(fileName);
    expect(returnedModel).toEqual(payload);
    expect(ui.getAllByText(`Sent ${fileName}`).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  // A phone whose every model is vision-capable used to be told it had nothing to send: the send side
  // refused any model with an mmproj, while the receiving side had installed those packages all along.
  it('offers a vision package to a paired device and withholds a runtime that device cannot run', async () => {
    const vision = createVisionModel({
      id: 'google/gemma-4-E2B/gemma-4-E2B-it-Q4_K_M.gguf',
      name: 'Gemma 4 E2B',
      fileName: 'gemma-4-E2B-it-Q4_K_M.gguf',
      mmProjFileName: 'gemma-4-e2b-it-mmproj-F16.gguf',
    });
    const liteRT = createDownloadedModel({
      id: 'google/gemma-4-litert/gemma-4.task',
      name: 'Gemma 4 LiteRT',
      fileName: 'gemma-4.task',
      engine: 'litert',
    });
    // Installed models are a device leaf: the rows the app persisted plus the files on disk. The
    // service reads them back through its real storage, exactly as it does after a download.
    const modelsDir = `${modelTransferFsBoundary.DocumentDirectoryPath}/models`;
    await modelTransferFsBoundary.module.mkdir(modelsDir);
    for (const name of [
      vision.fileName,
      'gemma-4-e2b-it-mmproj-F16.gguf',
      liteRT.fileName,
    ]) {
      await modelTransferFsBoundary.module.writeFile(`${modelsDir}/${name}`, 'x');
    }
    await AsyncStorage.setItem(
      '@local_llm/downloaded_models',
      JSON.stringify([
        {
          ...vision,
          filePath: `${modelsDir}/${vision.fileName}`,
          mmProjPath: `${modelsDir}/gemma-4-e2b-it-mmproj-F16.gguf`,
        },
        { ...liteRT, filePath: `${modelsDir}/${liteRT.fileName}` },
      ]),
    );
    const iPhone: DeviceInfo = {
      id: 'paired-iphone',
      name: 'iPhone',
      platform: 'ios',
      version: '1.0.0',
      host: '192.168.1.20',
      port: 51000,
    };

    ui = render(
      <NavigationContainer>
        <ModelTransferSheet target={iPhone} onClose={() => {}} />
      </NavigationContainer>,
    );

    // The vision model is offerable: GGUF runs on any Off Grid AI device, mmproj included.
    await waitFor(() => expect(ui!.getByTestId(`transfer-model-${vision.id}`)).toBeTruthy());
    // LiteRT exists only on Android, so an iPhone is never offered one.
    expect(ui.queryByTestId(`transfer-model-${liteRT.id}`)).toBeNull();
    // Its size is the whole package, not just the primary file.
    expect(ui.getByText(/4\.5 GB|4\.49 GB/)).toBeTruthy();
  });
});
