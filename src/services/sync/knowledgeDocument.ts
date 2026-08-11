import { callHook, HOOKS } from '../../bootstrap/hookRegistry';
import type { KnowledgeDocumentDescriptor } from '@offgrid/sync';

export interface KnowledgeDocumentSnapshot extends KnowledgeDocumentDescriptor {
  filePath: string;
  fileSize: number;
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
