import { callHook, HOOKS } from '../../bootstrap/hookRegistry';

export const KNOWLEDGE_DOCUMENT_MIME =
  'application/vnd.offgrid.knowledge-document';

export interface KnowledgeDocumentSnapshot {
  syncId: string;
  projectId: string;
  name: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  enabled: boolean;
}

export type KnowledgeDocumentMutation =
  | { kind: 'indexed'; document: KnowledgeDocumentSnapshot }
  | { kind: 'enabled'; syncId: string; enabled: boolean }
  | { kind: 'deleted'; syncId: string };

export function emitKnowledgeDocumentMutation(
  mutation: KnowledgeDocumentMutation,
): void {
  try {
    callHook(HOOKS.syncKnowledgeDocumentMutation, mutation);
  } catch {
    // Sync is additive. A Pro integration failure must not roll back local RAG.
  }
}
