import { generateId } from '../utils/generateId';
import type { Message } from '../types';

export const CHAT_STORAGE_VERSION = 1;

export function createPersistedMessage(
  data: Omit<Message, 'id' | 'timestamp'>,
): Message {
  const id = generateId();
  return { id, ...data, uuid: data.uuid ?? id, timestamp: Date.now() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Version 1 gives every legacy persisted message the wire identity desktop uses
 * for `rag_messages.uuid`. Conversation/message local ids stay unchanged, so
 * active-chat references and compaction cutoffs remain valid.
 */
export function migratePersistedChatState(
  persistedState: unknown,
  version: number,
): unknown {
  if (version >= CHAT_STORAGE_VERSION || !isRecord(persistedState)) {
    return persistedState;
  }
  const conversations = persistedState.conversations;
  if (!Array.isArray(conversations)) return persistedState;

  return {
    ...persistedState,
    conversations: conversations.map(conversation => {
      if (!isRecord(conversation) || !Array.isArray(conversation.messages)) {
        return conversation;
      }
      return {
        ...conversation,
        messages: conversation.messages.map(message => {
          if (!isRecord(message) || typeof message.uuid === 'string') {
            return message;
          }
          return { ...message, uuid: generateId() };
        }),
      };
    }),
  };
}
