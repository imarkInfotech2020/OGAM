import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, Conversation, GenerationMeta } from '../types';
import {
  stripStreamingControlTokens,
  parseModelOutput,
} from '../utils/messageContent';
import { generateId } from '../utils/generateId';
import { callHook, HOOKS } from '../bootstrap/hookRegistry';
import {
  CHAT_STORAGE_VERSION,
  createPersistedMessage,
  migratePersistedChatState,
} from './chatPersistence';
import {
  createMessageMutationActions,
  nextUpdatedAt,
  type ChatMessageMutationActions,
} from './chatMessageMutationActions';
import {
  CORE_SYNC_ENTITIES,
  conversationPutMutation,
  deleteSyncMutation,
  emitSyncMutation,
  messagePutMutation,
} from '../services/sync/mutation';

/**
 * The portion of the in-progress stream that is safe to SPEAK in voice mode —
 * never the reasoning/thinking. Models that stream reasoning on a separate
 * channel leave streamingMessage answer-only. Models that inline reasoning (e.g.
 * Qwen3, whose chat template injects the opening <think> so only a closing
 * </think> is emitted) are sliced at </think>; until that tag arrives we withhold
 * (return '') while thinking is enabled, so the thought process is never spoken
 * sentence-by-sentence. onStreamingEnd still speaks the final answer if nothing
 * streamed.
 */
function speakableStreamingAnswer(
  streamingMessage: string,
  streamingReasoning: string,
): string {
  if (streamingReasoning.length > 0) return streamingMessage; // reasoning came separately
  const closeIdx = streamingMessage.toLowerCase().lastIndexOf('</think>');
  if (closeIdx !== -1)
    return streamingMessage.slice(closeIdx + '</think>'.length);
  // No close tag yet: inline reasoning may still be in progress. Withhold while
  // thinking is enabled; otherwise the content is the answer and is safe to speak.
  const { useAppStore } = require('./appStore');
  return useAppStore.getState().settings?.thinkingEnabled
    ? ''
    : streamingMessage;
}

/** Derive conversation title from the first user message. */
function deriveTitle(
  currentTitle: string,
  role: string,
  content: string,
): string {
  if (currentTitle !== 'New Conversation' || role !== 'user')
    return currentTitle;
  const truncated = content.slice(0, 50);
  return content.length > 50 ? `${truncated}...` : truncated;
}

export interface ChatState extends ChatMessageMutationActions {
  conversations: Conversation[];
  activeConversationId: string | null;
  streamingMessage: string;
  streamingReasoningContent: string;
  streamingForConversationId: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  createConversation: (
    modelId: string,
    title?: string,
    projectId?: string,
  ) => string;
  deleteConversation: (conversationId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;
  getActiveConversation: () => Conversation | null;
  setConversationProject: (
    conversationId: string,
    projectId: string | null,
  ) => void;
  /** Unfile every conversation filed under a project (used when the project is deleted,
   *  so no chat is left pointing at a project that no longer exists). */
  unfileConversationsForProject: (projectId: string) => void;
  addMessage: (
    conversationId: string,
    message: Omit<Message, 'id' | 'timestamp'>,
  ) => Message;
  startStreaming: (conversationId: string) => void;
  setStreamingMessage: (content: string) => void;
  appendToStreamingMessage: (token: string) => void;
  appendToStreamingReasoningContent: (token: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setIsThinking: (thinking: boolean) => void;
  finalizeStreamingMessage: (
    conversationId: string,
    generationTimeMs?: number,
    generationMeta?: GenerationMeta,
  ) => void;
  clearStreamingMessage: () => void;
  getStreamingState: () => {
    conversationId: string | null;
    content: string;
    reasoningContent: string;
    isStreaming: boolean;
    isThinking: boolean;
  };
  updateCompactionState: (
    conversationId: string,
    summary?: string,
    cutoffMessageId?: string,
  ) => void;
  clearAllConversations: () => void;
  getConversationMessages: (conversationId: string) => Message[];
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      streamingMessage: '',
      streamingReasoningContent: '',
      streamingForConversationId: null,
      isStreaming: false,
      isThinking: false,

      createConversation: (modelId, title, projectId) => {
        const id = generateId();
        const conversation: Conversation = {
          id,
          title: title || 'New Conversation',
          modelId,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          projectId: projectId,
        };

        set(state => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: id,
        }));
        emitSyncMutation(conversationPutMutation(conversation));

        return id;
      },

      deleteConversation: conversationId => {
        const removed = get().conversations.find(c => c.id === conversationId);
        set(state => ({
          conversations: state.conversations.filter(
            c => c.id !== conversationId,
          ),
          activeConversationId:
            state.activeConversationId === conversationId
              ? null
              : state.activeConversationId,
        }));
        for (const message of removed?.messages ?? []) {
          if (message.uuid)
            emitSyncMutation(
              deleteSyncMutation(CORE_SYNC_ENTITIES.message, message.uuid),
            );
        }
        if (removed)
          emitSyncMutation(
            deleteSyncMutation(CORE_SYNC_ENTITIES.conversation, conversationId),
          );
      },

      setActiveConversation: conversationId => {
        set({ activeConversationId: conversationId });
      },

      getActiveConversation: () => {
        const state = get();
        return (
          state.conversations.find(c => c.id === state.activeConversationId) ||
          null
        );
      },

      setConversationProject: (conversationId, projectId) => {
        set(state => ({
          conversations: state.conversations.map(conv =>
            conv.id !== conversationId
              ? conv
              : {
                  ...conv,
                  projectId: projectId || undefined,
                  updatedAt: nextUpdatedAt(conv.updatedAt),
                },
          ),
        }));
        const conversation = get().conversations.find(
          conv => conv.id === conversationId,
        );
        if (conversation)
          emitSyncMutation(conversationPutMutation(conversation));
      },

      unfileConversationsForProject: projectId => {
        const affected = get().conversations.filter(
          conv => conv.projectId === projectId,
        );
        set(state => ({
          conversations: state.conversations.map(conv =>
            conv.projectId !== projectId
              ? conv
              : {
                  ...conv,
                  projectId: undefined,
                  updatedAt: nextUpdatedAt(conv.updatedAt),
                },
          ),
        }));
        for (const previous of affected) {
          const conversation = get().conversations.find(
            conv => conv.id === previous.id,
          );
          if (conversation)
            emitSyncMutation(conversationPutMutation(conversation));
        }
      },

      addMessage: (conversationId, messageData) => {
        const message = createPersistedMessage(messageData);

        set(state => ({
          conversations: state.conversations.map(conv =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, message],
                  updatedAt: nextUpdatedAt(conv.updatedAt),
                  title: deriveTitle(
                    conv.title,
                    messageData.role,
                    messageData.content,
                  ),
                }
              : conv,
          ),
        }));
        emitSyncMutation(messagePutMutation(conversationId, message));
        const conversation = get().conversations.find(
          conv => conv.id === conversationId,
        );
        if (conversation)
          emitSyncMutation(conversationPutMutation(conversation));

        return message;
      },

      ...createMessageMutationActions({
        updateConversations: update =>
          set(state => ({ conversations: update(state.conversations) })),
        getConversationMessages: conversationId =>
          get().getConversationMessages(conversationId),
      }),

      startStreaming: conversationId => {
        set({
          streamingForConversationId: conversationId,
          streamingMessage: '',
          streamingReasoningContent: '',
          isStreaming: false,
          isThinking: true,
        });
      },

      setStreamingMessage: content => {
        set({ streamingMessage: content });
      },

      appendToStreamingMessage: token => {
        set(state => ({
          streamingMessage: stripStreamingControlTokens(
            state.streamingMessage + token,
          ),
          isStreaming: true,
          isThinking: false,
        }));
        // Feed only the ANSWER to pro audio for real-time sentence-by-sentence
        // TTS (never the reasoning) — no-op unless voice mode + engine ready;
        // free builds register nothing.
        callHook(
          HOOKS.audioOnStreamingToken,
          speakableStreamingAnswer(
            get().streamingMessage,
            get().streamingReasoningContent,
          ),
        );
      },

      appendToStreamingReasoningContent: token => {
        set(state => ({
          streamingReasoningContent: state.streamingReasoningContent + token,
          isStreaming: true,
          isThinking: false,
        }));
      },

      setIsStreaming: streaming => {
        set({ isStreaming: streaming, isThinking: false });
      },

      setIsThinking: thinking => {
        set({ isThinking: thinking });
      },

      finalizeStreamingMessage: (
        conversationId,
        generationTimeMs,
        generationMeta,
      ) => {
        const {
          streamingMessage,
          streamingReasoningContent,
          streamingForConversationId,
          addMessage,
        } = get();

        // Parse ONCE at this boundary through the single shared parser (SoC §A / DR1):
        // split the raw stream into reasoning + a clean answer. The answer is stripped of
        // control and tool-call markup BY CONSTRUCTION, so no raw markup can reach the
        // stored message — and no renderer downstream re-parses message.content.
        const streamReasoning = streamingReasoningContent.trim() || undefined;
        const parsed = parseModelOutput(streamingMessage, streamReasoning);
        const reasoningContent = parsed.reasoning ?? undefined;
        const sanitizedMessage = parsed.answer;
        if (
          streamingForConversationId === conversationId &&
          (sanitizedMessage || reasoningContent)
        ) {
          addMessage(conversationId, {
            role: 'assistant',
            content: sanitizedMessage,
            reasoningContent,
            generationTimeMs,
            generationMeta,
          });
        }
        set({
          streamingMessage: '',
          streamingReasoningContent: '',
          streamingForConversationId: null,
          isStreaming: false,
          isThinking: false,
        });
      },

      clearStreamingMessage: () => {
        set({
          streamingMessage: '',
          streamingReasoningContent: '',
          streamingForConversationId: null,
          isStreaming: false,
          isThinking: false,
        });
      },

      getStreamingState: () => {
        const state = get();
        return {
          conversationId: state.streamingForConversationId,
          content: state.streamingMessage,
          reasoningContent: state.streamingReasoningContent,
          isStreaming: state.isStreaming,
          isThinking: state.isThinking,
        };
      },

      updateCompactionState: (conversationId, summary, cutoffMessageId) => {
        set(state => ({
          conversations: state.conversations.map(conv =>
            conv.id === conversationId
              ? {
                  ...conv,
                  compactionSummary: summary,
                  compactionCutoffMessageId: cutoffMessageId,
                  updatedAt: nextUpdatedAt(conv.updatedAt),
                }
              : conv,
          ),
        }));
      },

      clearAllConversations: () => {
        const removed = get().conversations;
        set({ conversations: [], activeConversationId: null });
        for (const conversation of removed) {
          for (const message of conversation.messages) {
            if (message.uuid)
              emitSyncMutation(
                deleteSyncMutation(CORE_SYNC_ENTITIES.message, message.uuid),
              );
          }
          emitSyncMutation(
            deleteSyncMutation(
              CORE_SYNC_ENTITIES.conversation,
              conversation.id,
            ),
          );
        }
      },

      getConversationMessages: conversationId => {
        const conversation = get().conversations.find(
          c => c.id === conversationId,
        );
        return conversation?.messages || [];
      },
    }),
    {
      name: 'local-llm-chat-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: CHAT_STORAGE_VERSION,
      migrate: migratePersistedChatState,
      partialize: state => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
    },
  ),
);
