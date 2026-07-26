// Singleton that owns the @offgrid/sync engine lifecycle for the app and reflects its events into
// useSyncStore for the Sync screen. Pairing uses a shared code (the passphrase) both devices enter;
// paired shared-secrets are held in-memory for now (persist in a later slice so reconnects are
// silent). Thin: all protocol/crypto is the package; wiring is the tested factories via nativeSync.
import { createNativeSync } from './nativeSync';
import type { NativeSync } from './nativeSync';
import { getOrCreateLocalDevice } from './localDevice';
import { useSyncStore } from '../../stores/syncStore';
import logger from '../../utils/logger';
import type { DeviceInfo } from '@offgrid/sync';

let sync: NativeSync | null = null;
const sharedSecrets = new Map<string, string>();

export const syncService = {
  isRunning: (): boolean => sync !== null,

  async start(): Promise<void> {
    if (sync) return;
    const store = useSyncStore.getState();
    store.setStatus('starting');
    try {
      const local = await getOrCreateLocalDevice();
      store.setThisDevice(local);
      const s = createNativeSync(local, {
        // Inbound pairing: use the code the user entered on THIS device (both sides enter the same).
        getPassphrase: () => useSyncStore.getState().pairingCode || undefined,
        getSharedSecret: (id) => sharedSecrets.get(id),
        onDiscovered: (d) => useSyncStore.getState().upsertDiscovered(d),
        onLost: (id) => useSyncStore.getState().removeDiscovered(id),
        onPaired: (d) => {
          sharedSecrets.set(d.id, d.sharedSecret);
          useSyncStore.getState().addPaired(d);
          logger.log(`[SYNC] paired with ${d.name ?? d.id}`);
        },
        onPairingFailed: (r, err) => logger.warn(`[SYNC] pairing failed with ${r?.id ?? 'unknown'}: ${err}`),
        onAppMessage: (id, channel, data) =>
          logger.log(`[SYNC] app message from ${id} ch=${channel} ${JSON.stringify(data)}`),
      });
      sync = s;
      await s.start();
      store.setStatus('running');
    } catch (e) {
      logger.warn(`[SYNC] start failed: ${String(e)}`);
      store.setStatus('error', e instanceof Error ? e.message : String(e));
    }
  },

  async stop(): Promise<void> {
    if (!sync) return;
    try { await sync.stop(); } finally {
      sync = null;
      useSyncStore.getState().reset();
    }
  },

  /** Dial a discovered device and run the pairing handshake with the shared code. */
  async pair(device: DeviceInfo, code: string): Promise<void> {
    if (!sync) throw new Error('Sync is not running');
    await sync.pair(device, code);
  },
};
