// The ONE module that binds @offgrid/sync to React Native's real native networking. It injects
// react-native-tcp-socket (transport) and react-native-zeroconf (mDNS) into the package's adapters
// via the tested buildSyncEngine / buildDiscovery factories, and owns start/stop sequencing. Kept
// deliberately thin: all logic worth testing lives in the factories (unit-tested off-device) and in
// @offgrid/sync itself; this file is the app-level wiring that can only run on a device.
import { Platform } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import Zeroconf from 'react-native-zeroconf';
import type {
  DeviceInfo,
  DiscoveredDevice,
  PairedDevice,
  Message,
  DeviceCap,
} from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import type { RnZeroconf } from '@offgrid/sync/rn-discovery';
import { buildSyncEngine } from './engine';
import { buildDiscovery } from './discovery';
import { IosProximityAdapter } from './nativeProximity';
import logger from '../../utils/logger';

export interface NativeSyncCallbacks {
  /** Passphrase for an INBOUND pairing (UI prompt). Return null to refuse. */
  getPassphrase?: (
    remote: DeviceInfo,
  ) => Promise<string | null | undefined> | string | null | undefined;
  /** Stored shared secret for a device (for silent reconnect). */
  getSharedSecret?: (deviceId: string) => string | undefined;
  onPaired?: (device: PairedDevice) => void;
  onPairingFailed?: (remote: DeviceInfo | undefined, error: string) => void;
  onDisconnected?: (deviceId: string) => void;
  onRouteChanged?: (deviceId: string, routeId: string | undefined) => void;
  onDiscovered?: (device: DiscoveredDevice) => void;
  onLost?: (deviceId: string) => void;
  onAppMessage?: (deviceId: string, channel: string, data: unknown) => void;
  onMessage?: (deviceId: string, message: Message) => void;
  deviceCap?: DeviceCap;
}

export interface NativeSync {
  readonly localDevice: DeviceInfo;
  readonly availableRouteIds: readonly string[];
  start(): Promise<void>;
  stop(): Promise<void>;
  rescan(): Promise<void>;
  renameLocalDevice(name: string): Promise<void>;
  pair(device: DeviceInfo, passphrase: string): Promise<void>;
  reconnect(device: DeviceInfo, sharedSecret: string): Promise<void>;
  disconnect(deviceId: string): boolean;
  send(deviceId: string, message: Message): boolean;
  sendApp(deviceId: string, channel: string, data: unknown): boolean;
  isPaired(deviceId: string): boolean;
}

/** Construct (but don't start) the mobile Sync stack for a given local device. */
export function createNativeSync(
  localDevice: DeviceInfo,
  cbs: NativeSyncCallbacks,
): NativeSync {
  let proximity: IosProximityAdapter | null = null;
  if (Platform.OS === 'ios') {
    try {
      proximity = new IosProximityAdapter(localDevice);
    } catch (error) {
      logger.warn(
        `[SYNC] proximity unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  const { engine, transport } = buildSyncEngine({
    localDevice,
    tcpModule: TcpSocket as unknown as RnTcpModule,
    getPassphrase: cbs.getPassphrase,
    getSharedSecret: cbs.getSharedSecret,
    onPaired: cbs.onPaired,
    onPairingFailed: cbs.onPairingFailed,
    onDisconnected: cbs.onDisconnected,
    onRouteChanged: cbs.onRouteChanged,
    onMessage: cbs.onMessage,
    onAppMessage: cbs.onAppMessage,
    cap: cbs.deviceCap,
    additionalRoutes: proximity
      ? [
          {
            id: 'proximity',
            bridge: proximity,
            canConnect: remote => proximity?.canConnect(remote) ?? false,
            connectTimeoutMs: 12_000,
          },
        ]
      : undefined,
    onRouteError: (routeId, error) => {
      logger.warn(`[SYNC] ${routeId} transport: ${error.message}`);
    },
  });
  const zeroconf = new Zeroconf() as unknown as RnZeroconf;
  const orchestrator = buildDiscovery({
    zeroconf,
    engine,
    localDevice,
    getSharedSecret: cbs.getSharedSecret ?? (() => undefined),
    onDiscovered: cbs.onDiscovered,
    onLost: cbs.onLost,
    additionalSources: proximity
      ? [{ id: 'proximity', service: proximity.discovery }]
      : undefined,
    onSourceError: (sourceId, error) => {
      logger.warn(`[SYNC] ${sourceId} discovery: ${error.message}`);
    },
  });
  let active = false;
  let rescanTask: Promise<void> | null = null;

  return {
    localDevice,
    availableRouteIds: proximity ? ['lan', 'proximity'] : ['lan'],
    async start() {
      await engine.start(0); // ephemeral port
      localDevice.port = transport.boundPort ?? 0; // advertise the real bound port
      await orchestrator.start();
      active = true;
      logger.log(
        `[SYNC] started id=${localDevice.id} port=${localDevice.port} platform=${localDevice.platform}`,
      );
    },
    async stop() {
      active = false;
      await rescanTask?.catch(() => undefined);
      await orchestrator.stop();
      await engine.stop();
      logger.log('[SYNC] stopped');
    },
    async rescan() {
      if (!active) throw new Error('Sync is not running.');
      if (rescanTask) return rescanTask;
      rescanTask = (async () => {
        await orchestrator.stop();
        if (!active) return;
        await orchestrator.start();
        logger.log('[SYNC] discovery rescanned');
      })();
      try {
        await rescanTask;
      } finally {
        rescanTask = null;
      }
    },
    async renameLocalDevice(name: string) {
      localDevice.name = name;
      if (!active) return;
      await proximity?.updateLocalDevice();
      await this.rescan();
    },
    pair: (device, passphrase) => engine.pair(device, passphrase),
    reconnect: (device, sharedSecret) => engine.reconnect(device, sharedSecret),
    disconnect: deviceId => engine.disconnect(deviceId),
    send: (deviceId, message) => engine.send(deviceId, message),
    sendApp: (deviceId, channel, data) =>
      engine.sendApp(deviceId, channel, data),
    isPaired: deviceId => engine.isPaired(deviceId),
  };
}

/** Best-effort platform tag for DeviceInfo. */
export function currentPlatform(): DeviceInfo['platform'] {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}
