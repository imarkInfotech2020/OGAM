import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Clipboard,
} from 'react-native';
import { useTheme, useThemedStyles } from '../../theme';
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

function buildMessageData(message: Message) {
  const displayContent = message.role === 'assistant'
    ? stripControlTokens(message.content)
    : message.content;
  const parsedContent = message.role === 'assistant'
    ? parseThinkingContent(displayContent)
    : { thinking: null, response: message.content, isThinkingComplete: true };
  return { displayContent, parsedContent };
}

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
