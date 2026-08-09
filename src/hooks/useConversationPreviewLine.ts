import { useCallback } from 'react';
import type { Message } from '../types';
import { useSyncIdentityStore } from '../stores/syncIdentityStore';
import { conversationPreviewLine } from '../utils/visibleMessages';

/**
 * The preview line for a conversation row, with this device's identity already bound.
 *
 * The rule needs to know which device is asking, and four list screens need the rule. Binding it
 * here means none of them subscribes to the identity store itself, so none of them can forget to
 * and quietly fall back to showing a peer's runtime notices.
 */
export function useConversationPreviewLine(): (messages: readonly Message[]) => string {
  const localDeviceId = useSyncIdentityStore(s => s.localDeviceId);
  return useCallback(
    (messages: readonly Message[]) => conversationPreviewLine(messages, localDeviceId),
    [localDeviceId],
  );
}
