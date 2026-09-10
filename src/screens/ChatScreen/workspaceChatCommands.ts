import type { WorkspaceContentChange } from '@offgrid/application';
import { applicationFacade } from '../../services/applicationFacade';
import { generateId } from '../../utils/generateId';

function isConversationPut(
  change: WorkspaceContentChange,
): change is Extract<
  WorkspaceContentChange,
  { kind: 'put'; entity: 'conversation' }
> {
  return change.kind === 'put' && change.entity === 'conversation';
}

export async function createWorkspaceConversation(
  input: { readonly pendingProjectId?: string },
  modelId: string,
  projectId?: string,
): Promise<string> {
  const outcome = await applicationFacade().workspaceContent.execute({
    type: 'create_conversation',
    modelId,
    projectId: projectId ?? input.pendingProjectId,
  });
  if (!outcome.ok) throw new Error(outcome.failure.message);
  const created = outcome.value.changes.find(isConversationPut);
  if (!created) {
    throw new Error(
      'Workspace Content did not return the created conversation',
    );
  }
  return created.record.id;
}

/** Write one runtime-authored assistant row through the canonical content owner. */
export async function appendWorkspaceAssistantMessage(
  conversationId: string,
  content: string,
  options?: { notice?: boolean },
): Promise<void> {
  const outcome = await applicationFacade().workspaceContent.execute({
    type: 'append_message',
    conversationId,
    messageId: generateId(),
    portable: {
      role: 'assistant',
      content,
      ...(options?.notice ? { context: { notice: true } } : {}),
    },
  });
  if (!outcome.ok) throw new Error(outcome.failure.message);
}

export async function updateWorkspaceConversationProject(
  conversationId: string,
  projectId: string | null,
): Promise<void> {
  const outcome = await applicationFacade().workspaceContent.execute({
    type: 'update_conversation',
    conversationId,
    patch: { projectId },
  });
  if (!outcome.ok) throw new Error(outcome.failure.message);
}
