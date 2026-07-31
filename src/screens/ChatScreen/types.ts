import type { ChatStreamPreviewRow } from '@offgrid/sync';
import { Message } from '../../types';
export type ChatMessageItem = {
  id: string;
  role: 'assistant';
  content: string;
  reasoningContent?: string;
  timestamp: number;
  isThinking?: boolean;
  isStreaming?: boolean;
};

/**
 * A reply generating on another device, mirrored into this conversation while it happens.
 *
 * Shaped by shared sync (`chatStreamPreviewRows`) rather than here, so the phone and the Mac append
 * the same rows in the same order under the same ids.
 */
export type RemoteStreamItem = ChatStreamPreviewRow;

export type StreamingState = {
  isThinking: boolean;
  streamingMessage: string;
  streamingReasoningContent: string;
  isStreamingForThisConversation: boolean;
  isModelLoading?: boolean;
  loadingModelName?: string;
  isGeneratingForThisConversation?: boolean;
  /** Live previews from paired devices. Empty in free builds and when nothing is generating. */
  remotePreviews?: readonly RemoteStreamItem[];
};

/**
 * Append the replies other devices are generating right now.
 *
 * They render through the SAME synthetic-streaming-message path as the local reply, so there is one
 * bubble implementation rather than a second renderer that would drift from it. Ids are namespaced
 * per generation so the list keeps one row per in-flight reply and never collides with the local
 * 'streaming' row - a device can be generating locally while a peer generates too.
 */
function withRemotePreviews(
  base: (Message | ChatMessageItem)[],
  remotePreviews: readonly RemoteStreamItem[] | undefined,
): (Message | ChatMessageItem)[] {
  if (!remotePreviews || remotePreviews.length === 0) return base;
  return [
    ...base,
    ...remotePreviews.map(preview => ({
      // The id comes from the shared projection, so it is stable across frames.
      id: preview.id,
      role: 'assistant' as const,
      content: preview.content,
      reasoningContent: preview.reasoning || undefined,
      timestamp: Date.now(),
      isStreaming: true,
    })),
  ];
}

let _lastDisplayBranch = '';
export function getDisplayMessages(
  allMessages: Message[],
  streaming: StreamingState,
): (Message | ChatMessageItem)[] {
  return withRemotePreviews(
    localDisplayMessages(allMessages, streaming),
    streaming.remotePreviews,
  );
}

function localDisplayMessages(
  allMessages: Message[],
  streaming: StreamingState,
): (Message | ChatMessageItem)[] {
  const { isThinking, streamingMessage, streamingReasoningContent, isStreamingForThisConversation } = streaming;
  // Model still loading for the in-progress reply: show it in the bubble so the
  // wait is explained ("Loading <model>…") instead of bare dots.
  if (streaming.isModelLoading && streaming.isGeneratingForThisConversation && !streamingMessage) {
    return [
      ...allMessages,
      { id: 'thinking', role: 'assistant' as const, content: streaming.loadingModelName ? `Loading ${streaming.loadingModelName}...` : 'Loading model...', timestamp: Date.now(), isThinking: true },
    ];
  }
  if (isThinking && isStreamingForThisConversation) {
    if (_lastDisplayBranch !== 'thinking') {
      _lastDisplayBranch = 'thinking';
    }
    return [
      ...allMessages,
      { id: 'thinking', role: 'assistant' as const, content: '', timestamp: Date.now(), isThinking: true },
    ];
  }
  if ((streamingMessage || streamingReasoningContent) && isStreamingForThisConversation) {
    if (_lastDisplayBranch !== 'streaming') {
      _lastDisplayBranch = 'streaming';
    }
    return [
      ...allMessages,
      { id: 'streaming', role: 'assistant' as const, content: streamingMessage, reasoningContent: streamingReasoningContent || undefined, timestamp: Date.now(), isStreaming: true },
    ];
  }
  if (_lastDisplayBranch !== 'done') {
    _lastDisplayBranch = 'done';
  }
  return allMessages;
}

type PlaceholderTextOptions = {
  hasModel: boolean;
  isModelLoading: boolean;
  supportsVision: boolean;
  imageOnly?: boolean;
};

export function getPlaceholderText({
  hasModel,
  isModelLoading,
  supportsVision,
  imageOnly,
}: PlaceholderTextOptions): string {
  if (!hasModel) return isModelLoading ? 'Loading model...' : 'Load a model to use chat';
  if (imageOnly) return 'Describe an image...';
  return supportsVision ? 'Type a message or add an image...' : 'Type a message...';
}
