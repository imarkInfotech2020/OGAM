import { create } from 'zustand';

interface SyncIdentityState {
  /**
   * This device's id in the personal mesh, or null when sync is not running (free builds, or
   * before the mesh has identified this device).
   */
  localDeviceId: string | null;
  setLocalDeviceId: (id: string | null) => void;
}

/**
 * Which device this one IS, for code that has to tell "mine" from "a peer's".
 *
 * The mesh identity is owned by Pro (`useSyncStore.thisDevice`), and core cannot import Pro. But
 * core renders the chat, and the chat has to answer one question about a synced row: did this
 * device write it. A model-load notice is the case that forced it - "Model loaded: Qwythos 9B" is
 * true on the phone that loaded it and false everywhere else, so the receiving device must be able
 * to recognise a notice as somebody else's.
 *
 * Pro pushes the id in as it establishes it; core only reads. Same direction as
 * `remoteChatStreamStore`, so the dependency still points one way. Null in free builds, where
 * nothing syncs and every message is local anyway.
 */
export const useSyncIdentityStore = create<SyncIdentityState>(set => ({
  localDeviceId: null,
  setLocalDeviceId: (localDeviceId) => set({ localDeviceId }),
}));
