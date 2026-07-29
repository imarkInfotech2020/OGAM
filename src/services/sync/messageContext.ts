import {
  parseSyncedMessageContext,
  projectSyncedMessageTurn,
  serializeSyncedMessageContext,
  type SyncedMessageContext,
  type SyncedMessageTurnInput,
  type SyncedMessageTurnProjection,
} from '@offgrid/sync';
import type { Message } from '../../types';

/** Serialize only the shared, peer-safe part of a persisted message context. */
export function serializeMessageContext(
  message: Pick<
    Message,
    | 'role'
    | 'reasoningContent'
    | 'toolArtifacts'
    | 'toolCallId'
    | 'toolName'
    | 'generationTimeMs'
  >,
): string | null {
  return serializeSyncedMessageContext({
    reasoning: message.reasoningContent,
    toolCalls: message.toolArtifacts,
    ...(message.role === 'tool'
      ? {
          tool: {
            callId: message.toolCallId,
            name: message.toolName,
            status: 'completed',
            durationMs: message.generationTimeMs,
          },
        }
      : {}),
    ...(message.generationTimeMs !== undefined
      ? { durationMs: message.generationTimeMs }
      : {}),
    status: 'completed',
  });
}

/** Admit peer-controlled context through the shared cross-host contract. */
export function parseMessageContext(
  value: unknown,
): SyncedMessageContext | null {
  return parseSyncedMessageContext(value);
}

/** Project a peer-controlled row into the one cross-host message-turn model. */
export function projectMessageTurn(
  input: SyncedMessageTurnInput,
): SyncedMessageTurnProjection | null {
  return projectSyncedMessageTurn(input);
}
