// Builds a @offgrid/sync SyncEngine wired for React Native: the platform-agnostic engine + the
// package's RN TCP adapter, fed our injected byte codec. The actual socket module
// (react-native-tcp-socket) is passed in by the caller (see nativeSync.ts) so this wiring stays
// pure and unit-testable with an in-memory socket module — the package never imports RN.
import { SyncEngine } from '@offgrid/sync';
import type { SyncEngineOptions, DeviceInfo } from '@offgrid/sync';
import { RnTcpTransport } from '@offgrid/sync/rn';
import type { RnTcpModule } from '@offgrid/sync/rn';
import { rnByteCodec } from './byteCodec';

export interface BuildSyncEngineArgs {
  localDevice: DeviceInfo;
  /** react-native-tcp-socket (or an in-memory fake in tests). */
  tcpModule: RnTcpModule;
  getPassphrase?: SyncEngineOptions['getPassphrase'];
  getSharedSecret?: SyncEngineOptions['getSharedSecret'];
  onPaired?: SyncEngineOptions['onPaired'];
  onPairingFailed?: SyncEngineOptions['onPairingFailed'];
  onMessage?: SyncEngineOptions['onMessage'];
  onAppMessage?: SyncEngineOptions['onAppMessage'];
  cap?: SyncEngineOptions['cap'];
}

/** Construct the RN transport (codec-injected) and the engine over it. Returns both so the caller
 *  can read transport.boundPort after start() to advertise the real listening port over mDNS. */
export function buildSyncEngine(args: BuildSyncEngineArgs): { engine: SyncEngine; transport: RnTcpTransport } {
  const transport = new RnTcpTransport(args.tcpModule, rnByteCodec);
  const engine = new SyncEngine({
    localDevice: args.localDevice,
    transport,
    getPassphrase: args.getPassphrase,
    getSharedSecret: args.getSharedSecret,
    onPaired: args.onPaired,
    onPairingFailed: args.onPairingFailed,
    onMessage: args.onMessage,
    onAppMessage: args.onAppMessage,
    cap: args.cap,
  });
  return { engine, transport };
}
