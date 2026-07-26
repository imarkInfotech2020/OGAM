// UI state for the Sync feature: the running status, this device, and the discovered/paired peers.
// The syncService owns the @offgrid/sync engine and pushes updates here; the SyncScreen renders it.
import { create } from 'zustand';
import type { DeviceInfo, DiscoveredDevice, PairedDevice } from '@offgrid/sync';

export type SyncStatus = 'idle' | 'starting' | 'running' | 'error';

interface SyncState {
  status: SyncStatus;
  error?: string;
  thisDevice?: DeviceInfo;
  /** Shared pairing code both devices enter (the pairing passphrase). */
  pairingCode: string;
  discovered: DiscoveredDevice[];
  paired: PairedDevice[];
  setPairingCode: (code: string) => void;
  setStatus: (status: SyncStatus, error?: string) => void;
  setThisDevice: (d: DeviceInfo) => void;
  upsertDiscovered: (d: DiscoveredDevice) => void;
  removeDiscovered: (id: string) => void;
  addPaired: (d: PairedDevice) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  pairingCode: '',
  discovered: [],
  paired: [],
  setPairingCode: (pairingCode) => set({ pairingCode }),
  setStatus: (status, error) => set({ status, error }),
  setThisDevice: (thisDevice) => set({ thisDevice }),
  upsertDiscovered: (d) =>
    set((s) => ({ discovered: [...s.discovered.filter((x) => x.id !== d.id), d] })),
  removeDiscovered: (id) => set((s) => ({ discovered: s.discovered.filter((x) => x.id !== id) })),
  addPaired: (d) =>
    set((s) => ({
      paired: [...s.paired.filter((x) => x.id !== d.id), d],
      discovered: s.discovered.filter((x) => x.id !== d.id), // paired → leaves the "discovered" list
    })),
  reset: () => set({ status: 'idle', error: undefined, discovered: [], paired: [] }),
}));
