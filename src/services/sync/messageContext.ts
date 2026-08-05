import {
  projectSyncedMessageTurn,
  serializeSyncedMessageContext,
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
    | 'generationMeta'
  >,
): string | null {
  return serializeSyncedMessageContext({
    reasoning: message.reasoningContent,
    // Which tools this turn was GIVEN, not just the ones it called: a reply that had three tools and
    // used none is a different fact, and it is only known on the device that generated it.
    toolsOffered: message.generationMeta?.routedToolNames,
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
/** Project a peer-controlled row into the one cross-host message-turn model. */
export function projectMessageTurn(
  input: SyncedMessageTurnInput,
): SyncedMessageTurnProjection | null {
  return projectSyncedMessageTurn(input);
}
