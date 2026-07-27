import { callHook, HOOKS } from '../../bootstrap/hookRegistry';
import type { Conversation, Message, Project } from '../../types';

/** Stable wire entity names shared with Off Grid Desktop. */
export const CORE_SYNC_ENTITIES = {
  conversation: 'conversation',
  message: 'message',
  project: 'project',
  modelSetting: 'model_setting',
} as const;

export type CoreSyncEntity =
  (typeof CORE_SYNC_ENTITIES)[keyof typeof CORE_SYNC_ENTITIES];

export interface SyncMutation {
  entity: CoreSyncEntity;
  entityId: string;
  kind: 'put' | 'delete';
  fields?: Record<string, unknown>;
}

export function conversationPutMutation(
  conversation: Conversation,
): SyncMutation {
  return {
    entity: CORE_SYNC_ENTITIES.conversation,
    entityId: conversation.id,
    kind: 'put',
    fields: {
      title: conversation.title,
      project_id: conversation.projectId ?? null,
      created_at: conversation.createdAt,
      updated_at: conversation.updatedAt,
    },
  };
}

export function messagePutMutation(
  conversationId: string,
  message: Message,
): SyncMutation | null {
  if (!message.uuid) return null;
  return {
    entity: CORE_SYNC_ENTITIES.message,
    entityId: message.uuid,
    kind: 'put',
    fields: {
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      context: null,
      created_at: new Date(message.timestamp).toISOString(),
    },
  };
}

export function projectPutMutation(project: Project): SyncMutation {
  return {
    entity: CORE_SYNC_ENTITIES.project,
    entityId: project.id,
    kind: 'put',
    fields: {
      name: project.name,
      description: project.description,
      system_prompt: project.systemPrompt,
      icon: project.icon ?? null,
      include_memory: 1,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    },
  };
}

export function deleteSyncMutation(
  entity: CoreSyncEntity,
  entityId: string,
): SyncMutation {
  return { entity, entityId, kind: 'delete' };
}

/** Core commits first; Pro optionally records the resulting canonical mutation. */
export function emitSyncMutation(mutation: SyncMutation | null): void {
  if (!mutation) return;
  try {
    callHook(HOOKS.syncRecordLocalMutation, mutation);
  } catch {
    // Sync is additive. A Pro integration failure must not roll back local data.
  }
}
