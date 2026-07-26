// Wires @offgrid/sync's DiscoveryOrchestrator to the package's RN mDNS adapter (RnDiscovery), fed
// an injected react-native-zeroconf instance (Android NSD / iOS Bonjour). The orchestrator browses
// for peers advertising `_offgrid._tcp.local` — the same service the desktop Node adapter uses, so
// phone and laptop find each other — and either auto-reconnects a known device or surfaces a new
// one for the pairing UI. The Zeroconf module is injected so this stays testable off-device.
import { DiscoveryOrchestrator } from '@offgrid/sync';
import type { DeviceInfo, DiscoveredDevice, SyncEngine } from '@offgrid/sync';
import { RnDiscovery } from '@offgrid/sync/rn-discovery';
import type { RnZeroconf } from '@offgrid/sync/rn-discovery';

export interface BuildDiscoveryArgs {
  /** react-native-zeroconf instance (or an in-memory fake in tests). */
  zeroconf: RnZeroconf;
  /** The SyncEngine — the orchestrator reads isPaired() and drives reconnect(). */
  engine: Pick<SyncEngine, 'isPaired' | 'reconnect'>;
  localDevice: DeviceInfo;
  getSharedSecret: (deviceId: string) => string | undefined;
  /** A new (unpaired) device appeared — surface it for the pairing UI. */
  onDiscovered?: (device: DiscoveredDevice) => void;
  onLost?: (deviceId: string) => void;
}

export function buildDiscovery(args: BuildDiscoveryArgs): DiscoveryOrchestrator {
  const discovery = new RnDiscovery(args.zeroconf);
  return new DiscoveryOrchestrator({
    engine: args.engine,
    discovery,
    localDevice: args.localDevice,
    getSharedSecret: args.getSharedSecret,
    onDiscovered: args.onDiscovered,
    onLost: args.onLost,
  });
}
