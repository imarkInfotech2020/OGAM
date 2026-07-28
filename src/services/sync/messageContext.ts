import {
  parseSyncedMessageContext,
  serializeSyncedMessageContext,
  type SyncedMessageContext,
} from '@offgrid/sync';
import type { Message } from '../../types';

/** Serialize only the shared, peer-safe part of a persisted message context. */
export function serializeMessageContext(
  message: Pick<Message, 'reasoningContent' | 'toolArtifacts'>,
): string | null {
  return serializeSyncedMessageContext({
    reasoning: message.reasoningContent,
    toolCalls: message.toolArtifacts,
  });
}

/** Admit peer-controlled context through the shared cross-host contract. */
export function parseMessageContext(
  value: unknown,
): SyncedMessageContext | null {
  return parseSyncedMessageContext(value);
}
