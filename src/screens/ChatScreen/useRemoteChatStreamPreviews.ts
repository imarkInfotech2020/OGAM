import { useMemo } from 'react';
import { useRemoteChatStreamStore } from '../../stores/remoteChatStreamStore';
import type { RemoteStreamItem } from './types';

/**
 * The replies paired devices are generating in THIS conversation, right now.
 *
 * Owns one job: narrowing the mesh-wide preview projection to the open conversation and shaping it
 * for the message list. Empty in free builds, and whenever no peer is mid-reply, so the chat screen
 * renders exactly as it did before.
 */
export function useRemoteChatStreamPreviews(
  activeConversationId: string | null,
): readonly RemoteStreamItem[] {
  const previews = useRemoteChatStreamStore(state => state.previews);
  return useMemo(() => {
    if (!activeConversationId) return [];
    return previews
      .filter(preview => preview.conversationId === activeConversationId)
      .map(preview => ({
        messageId: preview.messageId,
        content: preview.content,
        reasoning: preview.reasoning,
      }));
  }, [previews, activeConversationId]);
}
