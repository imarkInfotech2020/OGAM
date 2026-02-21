import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { useTheme, useThemedStyles } from '../../../theme';
import { createStyles } from '../styles';
import { DownloadedModel, ONNXImageModel } from '../../../types';
import { LoadingState } from '../hooks/useHomeScreen';

type Props = {
  loadingState: LoadingState;
  activeTextModel: DownloadedModel | undefined;
  activeImageModel: ONNXImageModel | undefined;
  downloadedModels: DownloadedModel[];
  downloadedImageModels: ONNXImageModel[];
  activeModelId: string | null;
  activeImageModelId: string | null;
  isEjecting: boolean;
  onPressTextModel: () => void;
  onPressImageModel: () => void;
  onEjectAll: () => void;
};

export const ActiveModelsSection: React.FC<Props> = ({
  loadingState,
  activeTextModel,
  activeImageModel,
  downloadedModels,
  downloadedImageModels,
  activeModelId,
  activeImageModelId,
  isEjecting,
  onPressTextModel,
  onPressImageModel,
  onEjectAll,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <>
      <View style={styles.modelsRow}>
        {/* Text Model */}
        <AnimatedPressable
          style={styles.modelCard}
          onPress={onPressTextModel}
          hapticType="selection"
        >
          <View style={styles.modelCardHeader}>
            <Icon name="message-square" size={16} color={colors.textMuted} />
            <Text style={styles.modelCardLabel}>Text</Text>
            {loadingState.isLoading && loadingState.type === 'text' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="chevron-down" size={14} color={colors.textMuted} />
            )}
          </View>
          {loadingState.isLoading && loadingState.type === 'text' ? (
            <>
              <Text style={styles.modelCardName} numberOfLines={1}>
                {loadingState.modelName || 'Unloading...'}
              </Text>
              <Text style={styles.modelCardLoading}>Loading...</Text>
            </>
          ) : activeTextModel ? (
            <>
              <Text style={styles.modelCardName} numberOfLines={1}>
                {activeTextModel.name}
              </Text>
              <Text style={styles.modelCardMeta}>
                {activeTextModel.quantization} · ~{(((activeTextModel.fileSize + (activeTextModel.mmProjFileSize || 0)) * 1.5) / (1024 * 1024 * 1024)).toFixed(1)} GB
              </Text>
            </>
          ) : (
            <Text style={styles.modelCardEmpty}>
              {downloadedModels.length > 0 ? 'Tap to select' : 'No models'}
            </Text>
          )}
        </AnimatedPressable>

        {/* Image Model */}
        <AnimatedPressable
          style={styles.modelCard}
          onPress={onPressImageModel}
          testID="image-model-card"
          hapticType="selection"
        >
          <View style={styles.modelCardHeader}>
            <Icon name="image" size={16} color={colors.textMuted} />
            <Text style={styles.modelCardLabel}>Image</Text>
            {loadingState.isLoading && loadingState.type === 'image' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="chevron-down" size={14} color={colors.textMuted} />
            )}
          </View>
          {loadingState.isLoading && loadingState.type === 'image' ? (
            <>
              <Text style={styles.modelCardName} numberOfLines={1}>
                {loadingState.modelName || 'Unloading...'}
              </Text>
              <Text style={styles.modelCardLoading}>Loading...</Text>
            </>
          ) : activeImageModel ? (
            <>
              <Text style={styles.modelCardName} numberOfLines={1}>
                {activeImageModel.name}
              </Text>
              <Text style={styles.modelCardMeta}>
                {activeImageModel.style || 'Ready'} · ~{((activeImageModel.size * 1.8) / (1024 * 1024 * 1024)).toFixed(1)} GB
              </Text>
            </>
          ) : (
            <Text style={styles.modelCardEmpty}>
              {downloadedImageModels.length > 0 ? 'Tap to select' : 'No models'}
            </Text>
          )}
        </AnimatedPressable>
      </View>

      {(activeModelId || activeImageModelId || loadingState.isLoading) && (
        <TouchableOpacity
          style={styles.ejectAllButton}
          onPress={onEjectAll}
          disabled={isEjecting}
        >
          {isEjecting ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <>
              <Icon name="power" size={14} color={colors.error} />
              <Text style={styles.ejectAllText}>
                {loadingState.isLoading ? 'Cancel Loading' : 'Eject All Models'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </>
  );
};
