import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ChatMessage } from '../../components';
import { AudioMessageBubble } from '../../components/AudioMessageBubble';
import { TTSButton } from '../../components/TTSButton';
import { AnimatedEntry } from '../../components/AnimatedEntry';
import { useTTSStore } from '../../stores/ttsStore';
import { stripControlTokens } from '../../utils/messageContent';
import { Message } from '../../types';
import '../../types/tts';
import { ChatMessageItem } from './useChatScreen';
import { parseThinkingContent, buildMessageData } from '../../components/ChatMessage/utils';
import { ThinkingBlock } from '../../components/ChatMessage/components/ThinkingBlock';
import { createStyles as createChatStyles } from '../../components/ChatMessage/styles';
import { useThemedStyles } from '../../theme';

type MessageRendererProps = {
  item: Message | ChatMessageItem;
  index: number;
  displayMessagesLength: number;
  animateLastN: number;
  imageModelLoaded: boolean;
  isStreaming: boolean;
  isGeneratingImage: boolean;
  showGenerationDetails: boolean;
  onCopy: (content: string) => void;
  onRetry: (message: Message) => void;
  onEdit: (message: Message, newContent: string) => void;
  onGenerateImage: (prompt: string) => void;
  onImagePress: (uri: string) => void;
};

/** Renders the thinking/reasoning block for audio mode without the ChatMessage bubble wrapper */
const AudioModeThinkingBlock: React.FC<{ msg: Message }> = ({ msg }) => {
  const chatStyles = useThemedStyles(createChatStyles);
  const [showThinking, setShowThinking] = useState(false);
  const { parsedContent } = buildMessageData(msg);
  if (!parsedContent.thinking) return null;
  return (
    <View style={chatStyles.thinkingBlockWrapper}>
      <ThinkingBlock
        parsedContent={parsedContent}
        showThinking={showThinking}
        onToggle={() => setShowThinking((v) => !v)}
        styles={chatStyles}
      />
    </View>
  );
};

function buildAudioBubbleProps(msg: Message) {
  return {
    messageId: msg.id,
    audioPath: msg.audioPath ?? '',
    waveformData: msg.waveformData ?? [],
    durationSeconds: msg.audioDurationSeconds ?? 0,
    transcript: stripControlTokens(msg.content),
    reasoningContent: msg.reasoningContent,
  };
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  item,
  index,
  displayMessagesLength,
  animateLastN,
  imageModelLoaded,
  isStreaming,
  isGeneratingImage,
  showGenerationDetails,
  onCopy,
  onRetry,
  onEdit,
  onGenerateImage,
  onImagePress,
}) => {
  const ttsMode = useTTSStore((s) => s.settings.interfaceMode);
  const msg = item as Message;
  const animateEntry = animateLastN > 0 && index >= displayMessagesLength - animateLastN;
  const isStreamingThis = item.id === 'streaming';

  // User voice message: always show as audio bubble (playable in both chat and audio mode)
  if (msg.role === 'user') {
    const audioAtt = msg.attachments?.find((a) => a.type === 'audio');
    if (audioAtt) {
      const bubble = (
        <View style={audioStyles.userContainer}>
          <AudioMessageBubble
            messageId={msg.id}
            audioPath={audioAtt.uri}
            waveformData={[]}
            durationSeconds={audioAtt.audioDurationSeconds ?? 0}
            transcript={msg.content}
            isUser
          />
        </View>
      );
      return animateEntry ? <AnimatedEntry index={0}>{bubble}</AnimatedEntry> : bubble;
    }
  }

  const isAudioAssistant = msg.role === 'assistant' && !msg.isSystemInfo && !msg.toolCalls?.length;

  // Thinking placeholder + audio streaming: intercept before the audio bubble check
  // so these don't accidentally render as empty AudioMessageBubbles.
  // Let them fall through to ChatMessage which renders the proper chat bubble with dots.
  const isThinkingItem = !!(msg as any).isThinking;
  if (isAudioAssistant && ttsMode === 'audio' && (isStreamingThis || isThinkingItem)) {
    // In audio mode: ChatMessage renders the 3-dot bubble for thinking,
    // "Generating response..." for streaming text. Both inside a proper chat bubble.
    return (
      <ChatMessage
        message={msg}
        isStreaming={isStreamingThis}
        onCopy={onCopy}
        onRetry={onRetry}
        onEdit={onEdit}
        onGenerateImage={onGenerateImage}
        onImagePress={onImagePress}
        canGenerateImage={false}
        showGenerationDetails={showGenerationDetails}
        animateEntry={false}
      />
    );
  }

  // Audio Mode: show assistant messages as audio bubbles ONLY after streaming ends.
  // In chat mode, all messages render as text (even ones generated in audio mode).
  // If the message has reasoningContent, render it as a regular ChatMessage first
  // (which shows the native ThinkingBlock), then the audio bubble below.
  if (isAudioAssistant && ttsMode === 'audio' && !isStreamingThis) {
    const hasThinking = !!msg.reasoningContent || !!parseThinkingContent(msg.content).thinking;
    const bubble = (
      <View style={audioStyles.assistantContainer}>
        {hasThinking && <AudioModeThinkingBlock msg={msg} />}
        <AudioMessageBubble {...buildAudioBubbleProps(msg)} />
      </View>
    );
    return animateEntry ? <AnimatedEntry index={0}>{bubble}</AnimatedEntry> : bubble;
  }

  // Chat Mode: TTSButton lives in the meta row via metaExtra prop
  const isPlainAssistant = msg.role === 'assistant' && !msg.isSystemInfo && !msg.toolCalls?.length;
  const ttsMeta = isPlainAssistant && !isStreamingThis
    ? <TTSButton text={stripControlTokens(msg.content)} messageId={msg.id} />
    : undefined;

  return (
    <ChatMessage
      message={msg}
      isStreaming={isStreamingThis}
      onCopy={onCopy}
      onRetry={onRetry}
      onEdit={onEdit}
      onGenerateImage={onGenerateImage}
      onImagePress={onImagePress}
      canGenerateImage={imageModelLoaded && !isStreaming && !isGeneratingImage}
      showGenerationDetails={showGenerationDetails}
      animateEntry={animateEntry}
      metaExtra={ttsMeta}
    />
  );
};

// Matches the horizontal padding of ChatMessage so audio bubbles align with text bubbles
const audioStyles = StyleSheet.create({
  userContainer: {
    paddingRight: 16,
    marginVertical: 8,
    alignItems: 'flex-end',
  },
  assistantContainer: {
    paddingHorizontal: 16,
    marginVertical: 8,
    alignItems: 'flex-start',
  },
});
