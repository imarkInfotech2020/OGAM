import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import TcpSocket from 'react-native-tcp-socket';
import {
  FileTransferManager,
  IncrementalChecksum,
  MODEL_TRANSFER_MIME,
  type DeviceInfo,
  type ModelPackageTransferMetadata,
  type TransferFileSource,
  type TransferredModelManifest,
} from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import { modelManager } from '../../../src/services/modelManager';
import { buildSyncEngine } from '../../../src/services/sync/engine';
import { whisperService } from '../../../src/services/whisperService';
import { useWhisperStore } from '../../../src/stores/whisperStore';
import { modelTransferService } from '../../../pro/sync/modelTransferService';
import { syncService } from '../../../pro/sync/syncService';
import { useSyncStore } from '../../../pro/sync/syncStore';
import {
  getDiscoveryBoundaries,
  resetDiscoveryBoundaries,
} from '../../utils/nativeSyncBoundaries';
import { modelTransferFsBoundary } from '../../utils/modelTransferFsBoundary';

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

async function waitForState(
  condition: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for model transfer state');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function packageSource(
  bytes: Buffer,
  metadata: ModelPackageTransferMetadata,
): TransferFileSource {
  const file = metadata.manifest.files[metadata.fileIndex];
  if (!file) throw new Error('Package source has no selected file');
  const checksum = new IncrementalChecksum();
  checksum.update(bytes);
  return {
    fileName: file.name,
    fileSize: bytes.length,
    mimeType: MODEL_TRANSFER_MIME,
    metadata,
    checksum: async () => checksum.digest(),
    read: async (offset, length) =>
      new Uint8Array(bytes.subarray(offset, offset + length)),
  };
}

function modelBytes(size: number, fill: number): Buffer {
  const bytes = Buffer.alloc(size, fill);
  bytes.write('GGUF', 0, 'ascii');
  return bytes;
}

function packageMetadata(
  packageId: string,
  manifest: TransferredModelManifest,
  fileIndex: number,
): ModelPackageTransferMetadata {
  return {
    type: 'offgrid-model',
    version: 2,
    packageId,
    fileIndex,
    manifest,
  };
}

describe('Pro mobile model package receiver', () => {
  let remote: ReturnType<typeof buildSyncEngine> | undefined;
  let remoteTransfers: FileTransferManager | undefined;

  beforeEach(async () => {
    modelTransferFsBoundary.reset();
    await AsyncStorage.clear();
    resetDiscoveryBoundaries();
    useSyncStore.getState().reset();
    await useWhisperStore.getState().refreshPresentModels();
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  });

  afterEach(async () => {
    await remoteTransfers?.dispose();
    await remote?.engine.stop();
    await syncService.stop();
    await modelTransferService.stop();
  });

  it('admits grouped vision and Whisper packages while rejecting image and Parakeet', async () => {
    const remoteDevice: DeviceInfo = {
      id: 'desktop-package-source',
      name: 'Off Grid AI Desktop',
      platform: 'macos',
      version: '1',
      host: '127.0.0.1',
      port: 0,
    };
    remote = buildSyncEngine({
      localDevice: remoteDevice,
      tcpModule: nativeTcpBoundary,
      onMessage: (deviceId, message) => {
        remoteTransfers?.handleMessage(deviceId, message);
      },
    });
    remoteTransfers = new FileTransferManager({
      send: (deviceId, message) => remote!.engine.send(deviceId, message),
      createSink: async () => null,
    });

    await remote.engine.start(0);
    remoteDevice.port = remote.transport.boundPort ?? 0;
    modelTransferService.start();
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
    await waitForState(
      () =>
        useSyncStore.getState().incomingPairingDevice?.id === remoteDevice.id,
    );
    syncService.acceptIncomingPairing('blue-otter-42');
    await pairing;
    await waitForState(() =>
      useSyncStore
        .getState()
        .knownDevices.some(
          device =>
            device.id === remoteDevice.id && device.status === 'connected',
        ),
    );

    const primary = modelBytes(96 * 1024 + 4, 0x31);
    const projector = modelBytes(64 * 1024 + 4, 0x32);
    const visionManifest: TransferredModelManifest = {
      id: 'off-grid/mobile-vision',
      name: 'Mobile Vision',
      kind: 'vision',
      source: 'downloaded',
      files: [
        {
          name: 'mobile-vision-Q4_K_M.gguf',
          sizeBytes: primary.length,
          role: 'primary',
        },
        {
          name: 'mmproj-mobile-vision-F16.gguf',
          sizeBytes: projector.length,
          role: 'projector',
        },
      ],
    };
    await remoteTransfers.sendFile(
      mobile.id,
      packageSource(
        primary,
        packageMetadata('vision-package', visionManifest, 0),
      ),
    );

    const modelsDirectory = modelManager.getModelsDirectory();
    await expect(
      modelTransferFsBoundary.exists(
        `${modelsDirectory}/${visionManifest.files[0].name}`,
      ),
    ).resolves.toBe(false);
    await expect(modelManager.getDownloadedModels()).resolves.toHaveLength(0);

    await remoteTransfers.sendFile(
      mobile.id,
      packageSource(
        projector,
        packageMetadata('vision-package', visionManifest, 1),
      ),
    );
    await expect(modelManager.getDownloadedModels()).resolves.toEqual([
      expect.objectContaining({
        id: `off-grid/mobile-vision/${visionManifest.files[0].name}`,
        name: 'Mobile Vision',
        engine: 'llama',
        isVisionModel: true,
        mmProjFileName: visionManifest.files[1].name,
        mmProjPath: `${modelsDirectory}/${visionManifest.files[1].name}`,
      }),
    ]);

    const whisper = Buffer.alloc(10 * 1024 * 1024 + 4, 0x44);
    const whisperManifest: TransferredModelManifest = {
      id: 'ggerganov/whisper.cpp/base.en',
      name: 'Whisper Base English',
      kind: 'transcription',
      source: 'catalog',
      files: [
        {
          name: 'ggml-base.en.bin',
          sizeBytes: whisper.length,
          role: 'primary',
        },
      ],
    };
    await remoteTransfers.sendFile(
      mobile.id,
      packageSource(
        whisper,
        packageMetadata('whisper-package', whisperManifest, 0),
      ),
    );
    await expect(whisperService.listDownloadedModels()).resolves.toEqual([
      expect.objectContaining({
        modelId: 'base.en',
        fileName: 'ggml-base.en.bin',
        sizeBytes: whisper.length,
      }),
    ]);
    expect(useWhisperStore.getState().presentModelIds).toContain('base.en');

    const imageManifest: TransferredModelManifest = {
      id: 'off-grid/mobile-image',
      name: 'Mobile Image',
      kind: 'image',
      source: 'downloaded',
      files: [
        {
          name: 'mobile-image.gguf',
          sizeBytes: primary.length,
          role: 'primary',
        },
      ],
    };
    await expect(
      remoteTransfers.sendFile(
        mobile.id,
        packageSource(
          primary,
          packageMetadata('image-package', imageManifest, 0),
        ),
      ),
    ).rejects.toThrow(
      'only text, vision, and Whisper transcription models can be sent to Off Grid Mobile',
    );

    const parakeet = Buffer.alloc(4096, 0x50);
    const parakeetManifest: TransferredModelManifest = {
      id: 'nvidia/parakeet',
      name: 'Parakeet',
      kind: 'transcription',
      source: 'catalog',
      files: [
        {
          name: 'parakeet-encoder.onnx',
          sizeBytes: parakeet.length,
          role: 'primary',
        },
      ],
    };
    await expect(
      remoteTransfers.sendFile(
        mobile.id,
        packageSource(
          parakeet,
          packageMetadata('parakeet-package', parakeetManifest, 0),
        ),
      ),
    ).rejects.toThrow(
      'only text, vision, and Whisper transcription models can be sent to Off Grid Mobile',
    );
  }, 30_000);
});
