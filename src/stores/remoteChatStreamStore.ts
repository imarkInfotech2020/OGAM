import { create } from 'zustand';

/** A reply currently generating on another device in the mesh. */
export interface RemoteChatStreamPreview {
  conversationId: string;
  /** Stable per generation, so the list keeps one row per in-flight reply. */
  messageId: string;
  content: string;
  reasoning?: string;
  /** Which device is generating, so the bubble can attribute it. */
  deviceId: string;
}

interface RemoteChatStreamState {
  previews: readonly RemoteChatStreamPreview[];
  setPreviews: (previews: readonly RemoteChatStreamPreview[]) => void;
}

/**
 * Read-only projection of the replies generating on other devices.
 *
 * Private Pro's chat-stream service owns the state machine (frames, ordering, expiry) and pushes
 * the visible result here; the chat screen only renders it. Nothing in this store is durable - the
 * finished message arrives separately through the op-log, and these previews vanish.
 *
 * Free builds never write to it, so it stays empty and the chat screen behaves exactly as before.
 */
export const useRemoteChatStreamStore = create<RemoteChatStreamState>(set => ({
  previews: [],
  setPreviews: previews => set({ previews }),
}));
