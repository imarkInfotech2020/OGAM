// TEMPORARY dev-only harness to prove the Sync transport end-to-end on real devices: start the
// engine + mDNS, auto-pair any discovered peer with a fixed dev passphrase, and log each step so
// two devices' logs show discovery → NaCl handshake → app message. NOT the shipped feature (the Pro
// Sync UI replaces this); gated behind __DEV__ + SYNC_DEV_HARNESS so it never runs in a real build.
import { createNativeSync } from './nativeSync';
import type { NativeSync } from './nativeSync';
import { getOrCreateLocalDevice } from './localDevice';
import logger from '../../utils/logger';

/** Flip to true to exercise the on-device transport proof. Dev builds only. */
export const SYNC_DEV_HARNESS = true;
const DEV_PASSPHRASE = 'offgrid-dev-pair';

let harness: NativeSync | null = null;

export async function startSyncDevHarness(): Promise<void> {
  if (harness) return;
  const local = await getOrCreateLocalDevice();
  logger.log(`[SYNC] dev harness starting name=${local.name} id=${local.id} platform=${local.platform}`);

  let sync: NativeSync;
  sync = createNativeSync(local, {
    getPassphrase: () => DEV_PASSPHRASE,
    onDiscovered: (d) => {
      logger.log(`[SYNC] discovered name=${d.name} id=${d.id} host=${d.host} port=${d.port} — auto-pairing (dev)`);
      sync.pair(d, DEV_PASSPHRASE).catch((e) => logger.warn(`[SYNC] pair error: ${String(e)}`));
    },
    onPaired: (d) => {
      logger.log(`[SYNC] PAIRED id=${d.id} — sending test app message`);
      const ok = sync.sendApp(d.id, 'devtest', { from: local.id });
      logger.log(`[SYNC] test app message queued=${ok}`);
    },
    onPairingFailed: (r, err) => logger.warn(`[SYNC] pairing FAILED with ${r?.id ?? 'unknown'}: ${err}`),
    onAppMessage: (id, channel, data) => logger.log(`[SYNC] APP MESSAGE from ${id} ch=${channel} data=${JSON.stringify(data)}`),
    onLost: (id) => logger.log(`[SYNC] lost id=${id}`),
  });
  harness = sync;
  await sync.start();
}
