import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Clipboard,
} from 'react-native';
import { useTheme, useThemedStyles } from '../../theme';
import Icon from 'react-native-vector-icons/Feather';
import { stripControlTokens } from '../../utils/messageContent';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from '../CustomAlert';
import { AnimatedEntry } from '../AnimatedEntry';
import { triggerHaptic } from '../../utils/haptics';
import { createStyles } from './styles';
import { MessageAttachments } from './components/MessageAttachments';
import { MessageContent } from './components/MessageContent';
import { GenerationMeta } from './components/GenerationMeta';
import { ActionMenuSheet, EditSheet } from './components/ActionMenuSheet';
import { parseThinkingContent, formatTime, formatDuration } from './utils';
import type { ChatMessageProps } from './types';
import type { Message } from '../../types';

function getToolIcon(toolName?: string): string {
  switch (toolName) {
    case 'web_search': return 'globe';
    case 'calculator': return 'hash';
    case 'get_current_datetime': return 'clock';
    case 'get_device_info': return 'smartphone';
    default: return 'tool';
  }
}

function getToolLabel(toolName?: string, content?: string): string {
  switch (toolName) {
    case 'web_search': {
      const queryMatch = content?.match(/^No results found for "([^"]+)"/);
      if (queryMatch) return `Searched: "${queryMatch[1]}" (no results)`;
      return 'Web search result';
    }
    case 'calculator': return content || 'Calculated';
    case 'get_current_datetime': return 'Retrieved date/time';
    case 'get_device_info': return 'Retrieved device info';
    default: return toolName || 'Tool result';
  }
}

function buildMessageData(message: Message) {
  const displayContent = message.role === 'assistant'
    ? stripControlTokens(message.content)
    : message.content;
  const parsedContent = message.role === 'assistant'
    ? parseThinkingContent(displayContent)
    : { thinking: null, response: message.content, isThinkingComplete: true };
  return { displayContent, parsedContent };
}

type ToolResultBubbleProps = {
  toolIcon: string;
  toolLabel: string;
  durationLabel: string;
  content: string;
  hasDetails: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: any;
};

const ToolResultBubble: React.FC<ToolResultBubbleProps> = ({
  toolIcon, toolLabel, durationLabel, content, hasDetails, styles, colors,
}) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <View testID="tool-message" style={styles.systemInfoContainer}>
      <TouchableOpacity
        style={styles.toolStatusRow}
        onPress={hasDetails ? () => setExpanded(!expanded) : undefined}
        activeOpacity={hasDetails ? 0.6 : 1}
        disabled={!hasDetails}
      >
        <Icon name={toolIcon} size={13} color={colors.textMuted} />
        <Text style={styles.toolStatusText} numberOfLines={expanded ? undefined : 2}>
          {toolLabel}{durationLabel}
        </Text>
        {hasDetails && (
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={colors.textMuted}
          />
        )}
      </TouchableOpacity>
      {expanded && hasDetails && (
        <View style={styles.toolDetailContainer}>
          <Text style={styles.toolDetailText} selectable>{content}</Text>
        </View>
      )}
    </View>
  );
};

type MetaRowProps = {
  message: Message;
  styles: ReturnType<typeof createStyles>;
  isStreaming?: boolean;
  showActions: boolean;
  onMenuOpen: () => void;
};

const MessageMetaRow: React.FC<MetaRowProps> = ({ message, styles, isStreaming, showActions, onMenuOpen }) => (
  <View style={styles.metaRow}>
    <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
    {message.generationTimeMs != null && message.role === 'assistant' && (
      <Text style={styles.generationTime}>{formatDuration(message.generationTimeMs)}</Text>
    )}
    {showActions && !isStreaming && (
      <TouchableOpacity style={styles.actionHint} onPress={onMenuOpen}>
        <Text style={styles.actionHintText}>•••</Text>
      </TouchableOpacity>
    )}
  </View>
);

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isStreaming,
  onImagePress,
  onCopy,
  onRetry,
  onEdit,
  onGenerateImage,
  showActions = true,
  canGenerateImage = false,
  showGenerationDetails = false,
  animateEntry = false,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [showThinking, setShowThinking] = useState(false);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);

  const { displayContent, parsedContent } = buildMessageData(message);

  const isUser = message.role === 'user';
  const hasAttachments = message.attachments && message.attachments.length > 0;

  const handleCopy = () => {
    Clipboard.setString(displayContent);
    triggerHaptic('notificationSuccess');
    if (onCopy) { onCopy(displayContent); }
    setShowActionMenu(false);
    setAlertState(showAlert('Copied', 'Message copied to clipboard'));
  };

  const handleRetry = () => {
    if (onRetry) { onRetry(message); }
    setShowActionMenu(false);
  };

  const handleEdit = () => {
    setEditedContent(message.content);
    setShowActionMenu(false);
    setTimeout(() => setIsEditing(true), 350);
  };

  const handleSaveEdit = () => {
    if (onEdit && editedContent.trim() !== message.content) {
      onEdit(message, editedContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedContent(message.content);
    setIsEditing(false);
  };

  const handleLongPress = () => {
    if (showActions && !isStreaming) {
      triggerHaptic('impactMedium');
      setShowActionMenu(true);
    }
  };

  const handleGenerateImage = () => {
    if (onGenerateImage) {
      const prompt = message.role === 'assistant'
        ? parsedContent.response.trim()
        : message.content.trim();
      const truncatedPrompt = prompt.slice(0, 500);
      onGenerateImage(truncatedPrompt);
    }
    setShowActionMenu(false);
  };

  if (message.isSystemInfo) {
    return (
      <>
        <View testID="system-info-message" style={styles.systemInfoContainer}>
          <Text style={styles.systemInfoText}>{displayContent}</Text>
        </View>
        <CustomAlert
          visible={alertState.visible}
          title={alertState.title}
          message={alertState.message}
          buttons={alertState.buttons}
          onClose={() => setAlertState(hideAlert())}
        />
      </>
    );
  }

  // Tool result messages — compact status bubble, tappable to expand details
  if (message.role === 'tool') {
    const toolIcon = getToolIcon(message.toolName);
    const toolLabel = getToolLabel(message.toolName, message.content);
    const durationLabel = message.generationTimeMs != null ? ` (${message.generationTimeMs}ms)` : '';
    const hasDetails = message.content && message.content.length > 0 && !message.content.startsWith('No results');
    return (
      <ToolResultBubble
        toolIcon={toolIcon}
        toolLabel={toolLabel}
        durationLabel={durationLabel}
        content={message.content}
        hasDetails={!!hasDetails}
        styles={styles}
        colors={colors}
      />
    );
  }

  // Assistant messages with tool calls — show as compact "calling tool" status
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return (
      <View testID="tool-call-message" style={styles.systemInfoContainer}>
        {message.toolCalls.map((tc, i) => {
          const toolIcon = getToolIcon(tc.name);
          let argsPreview = '';
          try {
            const parsed = JSON.parse(tc.arguments);
            argsPreview = Object.values(parsed).join(', ');
          } catch { argsPreview = tc.arguments; }
          return (
            <View key={`${tc.id || i}`} style={styles.toolStatusRow}>
              <Icon name={toolIcon} size={13} color={colors.primary} />
              <Text style={[styles.toolStatusText, { color: colors.primary }]} numberOfLines={1}>
                Using {tc.name}{argsPreview ? `: ${argsPreview}` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  const messageBody = (
    <TouchableOpacity
      testID={isUser ? 'user-message' : 'assistant-message'}
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
      activeOpacity={0.8}
      onLongPress={handleLongPress}
      delayLongPress={300}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          hasAttachments && styles.bubbleWithAttachments,
        ]}
      >
        {hasAttachments && (
          <MessageAttachments
            attachments={message.attachments!}
            isUser={isUser}
            styles={styles}
            colors={colors}
            onImagePress={onImagePress}
          />
        )}

        <MessageContent
          isUser={isUser}
          isThinking={message.isThinking}
          content={message.content}
          isStreaming={isStreaming}
          parsedContent={parsedContent}
          showThinking={showThinking}
          onToggleThinking={() => setShowThinking(!showThinking)}
          styles={styles}
        />
      </View>

      <MessageMetaRow
        message={message}
        styles={styles}
        isStreaming={isStreaming}
        showActions={showActions}
        onMenuOpen={() => setShowActionMenu(true)}
      />

      {showGenerationDetails && message.generationMeta && message.role === 'assistant' && (
        <GenerationMeta generationMeta={message.generationMeta} styles={styles} />
      )}
    </TouchableOpacity>
  );

  return (
    <>
      {animateEntry ? <AnimatedEntry index={0}>{messageBody}</AnimatedEntry> : messageBody}

      <ActionMenuSheet
        visible={showActionMenu}
        onClose={() => setShowActionMenu(false)}
        isUser={isUser}
        canEdit={!!onEdit}
        canRetry={!!onRetry}
        canGenerateImage={canGenerateImage && !!onGenerateImage}
        styles={styles}
        onCopy={handleCopy}
        onEdit={handleEdit}
        onRetry={handleRetry}
        onGenerateImage={handleGenerateImage}
      />

      <EditSheet
        visible={isEditing}
        onClose={handleCancelEdit}
        defaultValue={message.content}
        onChangeText={setEditedContent}
        onSave={handleSaveEdit}
        onCancel={handleCancelEdit}
        styles={styles}
        colors={colors}
      />

      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState(hideAlert())}
      />
    </>
  );
};
