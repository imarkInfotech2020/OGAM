import React, { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { ImageModeState, MediaAttachment } from '../types';
import { VoiceRecordButton } from './VoiceRecordButton';
import { triggerHaptic } from '../utils/haptics';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from './CustomAlert';
import { createStyles } from './ChatInput.styles';
import { ChatToolbar } from './ChatInputToolbar';
import { AttachmentPreview, useAttachments } from './ChatInputAttachments';
import { useVoiceInput } from './ChatInputVoice';

interface ChatInputProps {
  onSend: (message: string, attachments?: MediaAttachment[], forceImageMode?: boolean) => void;
  onStop?: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  placeholder?: string;
  supportsVision?: boolean;
  conversationId?: string | null;
  imageModelLoaded?: boolean;
  onImageModeChange?: (mode: ImageModeState) => void;
  onOpenSettings?: () => void;
  queueCount?: number;
  queuedTexts?: string[];
  onClearQueue?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onStop,
  disabled,
  isGenerating,
  placeholder = 'Type a message...',
  supportsVision = false,
  conversationId,
  imageModelLoaded = false,
  onImageModeChange,
  onOpenSettings: _onOpenSettings,
  queueCount = 0,
  queuedTexts = [],
  onClearQueue,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [message, setMessage] = useState('');
  const [imageMode, setImageMode] = useState<ImageModeState>('auto');
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const inputRef = useRef<TextInput>(null);

  const { attachments, removeAttachment, handlePickImage, handlePickDocument } = useAttachments(setAlertState);

  const { isRecording, isModelLoading, isTranscribing, partialResult, error, voiceAvailable, startRecording, stopRecording, clearResult } = useVoiceInput({
    conversationId,
    onTranscript: (text) => {
      setMessage(prev => {
        const prefix = prev.trim() ? `${prev.trim()} ` : '';
        return prefix + text;
      });
    },
  });

  const canSend = (message.trim().length > 0 || attachments.length > 0) && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    triggerHaptic('impactMedium');
    const forceImage = imageMode === 'force';
    onSend(message.trim(), attachments.length > 0 ? attachments : undefined, forceImage);
    setMessage('');
    inputRef.current?.focus();
    if (forceImage) {
      setImageMode('auto');
      onImageModeChange?.('auto');
    }
  };

  const handleImageModeToggle = () => {
    if (!imageModelLoaded) {
      setAlertState(showAlert(
        'No Image Model',
        'Download an image model from the Models screen to enable image generation.',
        [{ text: 'OK' }],
      ));
      return;
    }
    const newMode: ImageModeState = imageMode === 'auto' ? 'force' : 'auto';
    setImageMode(newMode);
    onImageModeChange?.(newMode);
  };

  const handleStop = () => {
    if (onStop && isGenerating) {
      triggerHaptic('impactLight');
      onStop();
    }
  };

  return (
    <View style={styles.container}>
      <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
      <ChatToolbar
        supportsVision={supportsVision}
        imageMode={imageMode}
        imageModelLoaded={imageModelLoaded}
        disabled={disabled}
        queueCount={queueCount}
        queuedTexts={queuedTexts}
        onClearQueue={onClearQueue}
        onPickDocument={handlePickDocument}
        onPickImage={handlePickImage}
        onImageModeToggle={handleImageModeToggle}
      />
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          testID="chat-input"
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          scrollEnabled
          editable={!disabled}
          blurOnSubmit={false}
          returnKeyType="default"
        />
        <View style={styles.inputActions}>
          {isGenerating && onStop && (
            <TouchableOpacity
              testID="stop-button"
              style={[styles.sendButton, styles.stopButton]}
              onPress={handleStop}
            >
              <Icon name="square" size={16} color={colors.error} />
            </TouchableOpacity>
          )}
          {canSend ? (
            <TouchableOpacity testID="send-button" style={styles.sendButton} onPress={handleSend}>
              <Icon name="send" size={18} color={colors.text} />
            </TouchableOpacity>
          ) : !isGenerating ? (
            <VoiceRecordButton
              isRecording={isRecording}
              isAvailable={voiceAvailable}
              isModelLoading={isModelLoading}
              isTranscribing={isTranscribing}
              partialResult={partialResult}
              error={error}
              disabled={disabled}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onCancelRecording={() => { stopRecording(); clearResult(); }}
              asSendButton
            />
          ) : null}
        </View>
      </View>
      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState(hideAlert())}
      />
    </View>
  );
};
