import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { useAppStore } from '../stores';
import { ImageModeState } from '../types';
import { createStyles } from './ChatInput.styles';

interface ChatToolbarProps {
  supportsVision: boolean;
  imageMode: ImageModeState;
  imageModelLoaded: boolean;
  disabled?: boolean;
  queueCount: number;
  queuedTexts: string[];
  onClearQueue?: () => void;
  onPickDocument: () => void;
  onPickImage: () => void;
  onImageModeToggle: () => void;
}

export const ChatToolbar: React.FC<ChatToolbarProps> = ({
  supportsVision,
  imageMode,
  imageModelLoaded,
  disabled,
  queueCount,
  queuedTexts,
  onClearQueue,
  onPickDocument,
  onPickImage,
  onImageModeToggle,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings } = useAppStore();

  return (
    <View style={styles.toolbarRow}>
      <View style={styles.toolbarLeft}>
        <TouchableOpacity
          testID="document-picker-button"
          style={styles.toolbarButton}
          onPress={onPickDocument}
          disabled={disabled}
        >
          <Icon name="paperclip" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {supportsVision && (
          <TouchableOpacity
            testID="camera-button"
            style={styles.toolbarButton}
            onPress={onPickImage}
            disabled={disabled}
          >
            <Icon name="camera" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {supportsVision && (
          <View testID="vision-indicator" style={styles.visionBadge}>
            <Text style={styles.visionBadgeText}>Vision</Text>
          </View>
        )}

        {settings.imageGenerationMode === 'manual' && imageModelLoaded && (
          <TouchableOpacity
            testID="image-mode-toggle"
            style={styles.toolbarButton}
            onPress={onImageModeToggle}
            disabled={disabled}
          >
            <Icon
              name="image"
              size={20}
              color={imageMode === 'force' ? colors.primary : colors.textSecondary}
            />
            {imageMode === 'force' && (
              <View testID="image-mode-on-badge" style={styles.onBadge}>
                <Text style={styles.onBadgeText}>ON</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {queueCount > 0 && (
          <View testID="queue-indicator" style={styles.queueBadge}>
            <Text style={styles.queueBadgeText}>{queueCount} queued</Text>
            {queuedTexts.length > 0 && (
              <Text style={styles.queuePreview} numberOfLines={1}>
                {queuedTexts[0].length > 30 ? `${queuedTexts[0].substring(0, 30)}...` : queuedTexts[0]}
              </Text>
            )}
            <TouchableOpacity
              testID="clear-queue-button"
              onPress={onClearQueue}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="x" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};
