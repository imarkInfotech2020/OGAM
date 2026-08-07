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
  DiscoveryScanSnapshot,
  DiscoveredDevice,
  PairingPersistence,
  PairedDevice,
  PairingAttemptSnapshot,
  MembershipRevocationPersistence,
  MembershipRevocationSnapshot,
  Message,
  DeviceCap,
  SyncDiscoverabilityHealthInput,
  SyncEngineOptions,
} from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';
import type { RnZeroconf } from '@offgrid/sync/rn-discovery';
import { buildSyncEngine } from './engine';
import { buildDiscovery } from './discovery';
import { IosProximityAdapter } from './nativeProximity';
import logger from '../../utils/logger';

export interface NativeSyncCallbacks {
  /** Passphrase for an INBOUND pairing (UI prompt). Return null to refuse. */
  getPassphrase?: SyncEngineOptions['getPassphrase'];
  /** Stored shared secret for a device (for silent reconnect). */
  getSharedSecret?: (deviceId: string) => string | undefined;
  getMembershipId?: (deviceId: string) => string | undefined;
  pairingEntitlement?: SyncEngineOptions['pairingEntitlement'];
  /** The persisted discoverability choice. Absent means advertise, as it always did. */
  discoverable?: boolean;
  pairingPersistence?: PairingPersistence;
  membershipPersistence?: MembershipRevocationPersistence;
  onMembershipRevocationChanged?: (
    snapshot: MembershipRevocationSnapshot,
  ) => void;
  onMembershipRevoked?: SyncEngineOptions['onMembershipRevoked'];
  onPaired?: (device: PairedDevice) => void;
  onPairingFailed?: (remote: DeviceInfo | undefined, error: string) => void;
  onPairingAttemptChanged?: (attempt: PairingAttemptSnapshot) => void;
  onDisconnected?: (deviceId: string) => void;
  onRouteChanged?: (deviceId: string, routeId: string | undefined) => void;
  onDiscovered?: (device: DiscoveredDevice) => void;
  onLost?: (deviceId: string) => void;
  onDiscoveryStateChanged?: (snapshot: DiscoveryScanSnapshot) => void;
  onHealthChanged?: (health: SyncDiscoverabilityHealthInput) => void;
  onAppMessage?: (deviceId: string, channel: string, data: unknown) => void;
  onMessage?: (deviceId: string, message: Message) => void;
  deviceCap?: DeviceCap;
}

export interface NativeSync {
  readonly localDevice: DeviceInfo;
  readonly availableRouteIds: readonly string[];
  getRuntimeHealth(): SyncDiscoverabilityHealthInput;
  start(): Promise<void>;
  stop(): Promise<void>;
  rescan(): Promise<void>;
  renameLocalDevice(name: string): Promise<void>;
  /** Advertise this device, or stop. Returns the value actually in effect. */
  setDiscoverable(next: boolean): Promise<boolean>;
  isDiscoverable(): boolean;
  pair(device: DeviceInfo, passphrase: string): Promise<PairedDevice>;
  cancelPairing(deviceId: string): Promise<boolean>;
  listPairingAttempts(): PairingAttemptSnapshot[];
  dismissPairingAttempt(attemptId: string): boolean;
  forget(
    deviceId: string,
    expectedMembershipId?: string,
  ): Promise<MembershipRevocationSnapshot | undefined>;
  retryMembershipRevocation(device: DeviceInfo): Promise<boolean>;
  dismissMembershipRevocation(revocationId: string): Promise<boolean>;
  listMembershipRevocations(): MembershipRevocationSnapshot[];
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
  const discoveredDeviceIds = new Set<string>();
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
    pairingEntitlement: cbs.pairingEntitlement,
    pairingPersistence: cbs.pairingPersistence,
    onPaired: cbs.onPaired,
    onPairingFailed: cbs.onPairingFailed,
    onPairingAttemptChanged: cbs.onPairingAttemptChanged,
    membershipPersistence: cbs.membershipPersistence,
    onMembershipRevocationChanged: cbs.onMembershipRevocationChanged,
    onMembershipRevoked: cbs.onMembershipRevoked,
    onDisconnected: (deviceId, reason) => {
      // Hand the drop to the orchestrator FIRST so a saved peer heals itself. Auto-reconnect used to
      // run only when discovery ANNOUNCED a device, so a peer already in the list was never retried
      // and stayed disconnected until someone tapped Reconnect. The reason rides along so a
      // disconnect the user asked for is left alone. Declared below and captured by this closure -
      // it is only ever called once a session has existed, long after both are built.
      orchestrator.handleDisconnected(deviceId, reason);
      cbs.onDisconnected?.(deviceId);
    },
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
      publishHealth();
    },
  });
  const zeroconf = new Zeroconf() as unknown as RnZeroconf;
  const orchestrator = buildDiscovery({
    zeroconf,
    engine,
    localDevice,
    ...(cbs.discoverable === undefined
      ? {}
      : { discoverable: cbs.discoverable }),
    getSharedSecret: cbs.getSharedSecret ?? (() => undefined),
    getMembershipId: cbs.getMembershipId,
    onDiscovered: device => {
      discoveredDeviceIds.add(device.id);
      cbs.onDiscovered?.(device);
      publishHealth();
    },
    onLost: deviceId => {
      discoveredDeviceIds.delete(deviceId);
      cbs.onLost?.(deviceId);
      publishHealth();
    },
    onDiscoveryStateChanged: snapshot => {
      cbs.onDiscoveryStateChanged?.(snapshot);
      publishHealth();
    },
    additionalSources: proximity
      ? [{ id: 'proximity', service: proximity.discovery }]
      : undefined,
    onSourceError: (sourceId, error) => {
      logger.warn(`[SYNC] ${sourceId} discovery: ${error.message}`);
      publishHealth();
    },
  });
  let active = false;
  let rescanTask: Promise<void> | null = null;

  function healthSnapshot(): SyncDiscoverabilityHealthInput {
    return {
      transport: transport.getTransportHealthSnapshot?.(),
      discovery: orchestrator.getDiscoveryHealthSnapshot(),
      scan: orchestrator.getDiscoveryState(),
      peerCount: discoveredDeviceIds.size,
    };
  }

  function publishHealth(): void {
    cbs.onHealthChanged?.(healthSnapshot());
  }

  return {
    localDevice,
    availableRouteIds: proximity ? ['lan', 'proximity'] : ['lan'],
    getRuntimeHealth: healthSnapshot,
    async start() {
      publishHealth();
      try {
        await engine.start(0); // ephemeral port
        localDevice.port = transport.boundPort ?? 0; // advertise the real bound port
        await orchestrator.start();
        active = true;
        publishHealth();
        logger.log(
          `[SYNC] started id=${localDevice.id} port=${localDevice.port} platform=${localDevice.platform}`,
        );
      } catch (error) {
        publishHealth();
        throw error;
      }
    },
    async stop() {
      active = false;
      await rescanTask?.catch(() => undefined);
      await orchestrator.stop();
      await engine.stop();
      discoveredDeviceIds.clear();
      publishHealth();
      logger.log('[SYNC] stopped');
    },
    async rescan() {
      if (!active) throw new Error('Sync is not running.');
      if (rescanTask) return rescanTask;
      rescanTask = (async () => {
        await orchestrator.rescan();
        logger.log('[SYNC] discovery rescanned');
      })();
      try {
        await rescanTask;
      } finally {
        rescanTask = null;
        publishHealth();
      }
    },
    async renameLocalDevice(name: string) {
      localDevice.name = name;
      if (!active) return;
      await proximity?.updateLocalDevice();
      await orchestrator.refreshAdvertisement();
    },
    /** Advertising on/off while sync keeps running. Idempotence is the orchestrator's. */
    async setDiscoverable(next: boolean) {
      await orchestrator.setDiscoverable(next);
      publishHealth();
      return orchestrator.isDiscoverable();
    },
    isDiscoverable: () => orchestrator.isDiscoverable(),
    pair: (device, passphrase) => engine.pair(device, passphrase),
    cancelPairing: deviceId => engine.cancelPairing(deviceId),
    listPairingAttempts: () => engine.listPairingAttempts(),
    dismissPairingAttempt: attemptId => engine.dismissPairingAttempt(attemptId),
    forget: (deviceId, expectedMembershipId) =>
      engine.forget(deviceId, expectedMembershipId),
    retryMembershipRevocation: device =>
      engine.retryMembershipRevocation(device),
    dismissMembershipRevocation: revocationId =>
      engine.dismissMembershipRevocation(revocationId),
    listMembershipRevocations: () => engine.listMembershipRevocations(),
    reconnect: (device, sharedSecret) =>
      engine.reconnect(device, sharedSecret, cbs.getMembershipId?.(device.id)),
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
