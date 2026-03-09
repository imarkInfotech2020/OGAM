import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AttachStep } from 'react-native-spotlight-tour';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { useTheme, useThemedStyles } from '../../../theme';
import { createStyles } from '../styles';
import { DownloadedModel, ONNXImageModel, RemoteModel } from '../../../types';
import { LoadingState } from '../hooks/useHomeScreen';

// Union types for models that can be active
type ActiveTextModel = DownloadedModel | RemoteModel | undefined;
type ActiveImageModel = ONNXImageModel | RemoteModel | undefined;

// Type guards
function isDownloadedModel(model: ActiveTextModel): model is DownloadedModel {
  return model !== undefined && 'filePath' in model;
}

function isRemoteModel(model: ActiveTextModel | ActiveImageModel): model is RemoteModel {
  return model !== undefined && 'serverId' in model;
}

function isOnnxImageModel(model: ActiveImageModel): model is ONNXImageModel {
  return model !== undefined && 'id' in model && !('serverId' in model);
}

type TextModelCardProps = {
  loadingState: LoadingState;
  activeTextModel: ActiveTextModel;
  downloadedModels: DownloadedModel[];
  remoteModelsCount: number;
  onPress: () => void;
};

const TextModelCard: React.FC<TextModelCardProps> = ({
  loadingState,
  activeTextModel,
  downloadedModels,
  remoteModelsCount,
  onPress,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isLoading = loadingState.isLoading && loadingState.type === 'text';
  const totalModels = downloadedModels.length + remoteModelsCount;

  return (
    <AnimatedPressable style={styles.modelCard} onPress={onPress} hapticType="selection">
      <View style={styles.modelCardHeader}>
        <Icon name="message-square" size={16} color={colors.textMuted} />
        <Text style={styles.modelCardLabel}>Text</Text>
        {isLoading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Icon name="chevron-down" size={14} color={colors.textMuted} />}
      </View>
      {(() => {
        if (isLoading) {
          return (
            <>
              <Text style={styles.modelCardName} numberOfLines={1}>
                {loadingState.modelName || 'Unloading...'}
              </Text>
              <Text style={styles.modelCardLoading}>Loading...</Text>
            </>
          );
        }
        if (activeTextModel) {
          const isRemote = isRemoteModel(activeTextModel);
          return (
            <>
              <View style={styles.modelCardNameRow}>
                <Text style={styles.modelCardName} numberOfLines={1}>
                  {activeTextModel.name}
                </Text>
                {isRemote && (
                  <View style={styles.remoteBadge}>
                    <Icon name="wifi" size={10} color={colors.primary} />
                  </View>
                )}
              </View>
              {isDownloadedModel(activeTextModel) ? (
                <Text style={styles.modelCardMeta}>
                  {activeTextModel.quantization} · ~{(((activeTextModel.fileSize + (activeTextModel.mmProjFileSize || 0)) * 1.5) / (1024 * 1024 * 1024)).toFixed(1)} GB
                </Text>
              ) : (
                <Text style={styles.modelCardMeta}>
                  Remote
                </Text>
              )}
            </>
          );
        }
        return (
          <Text style={styles.modelCardEmpty}>
            {totalModels > 0 ? 'Tap to select' : 'No models'}
          </Text>
        );
      })()}
    </AnimatedPressable>
  );
};

type ImageModelCardProps = {
  loadingState: LoadingState;
  activeImageModel: ActiveImageModel;
  downloadedImageModels: ONNXImageModel[];
  remoteModelsCount: number;
  onPress: () => void;
};

const ImageModelCard: React.FC<ImageModelCardProps> = ({
  loadingState,
  activeImageModel,
  downloadedImageModels,
  remoteModelsCount,
  onPress,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isLoading = loadingState.isLoading && loadingState.type === 'image';
  const totalModels = downloadedImageModels.length + remoteModelsCount;

  return (
    <AnimatedPressable
      style={styles.modelCard}
      onPress={onPress}
      testID="image-model-card"
      hapticType="selection"
    >
      <View style={styles.modelCardHeader}>
        <Icon name="image" size={16} color={colors.textMuted} />
        <Text style={styles.modelCardLabel}>Image</Text>
        {isLoading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Icon name="chevron-down" size={14} color={colors.textMuted} />}
      </View>
      {(() => {
        if (isLoading) {
          return (
            <>
              <Text style={styles.modelCardName} numberOfLines={1}>
                {loadingState.modelName || 'Unloading...'}
              </Text>
              <Text style={styles.modelCardLoading}>Loading...</Text>
            </>
          );
        }
        if (activeImageModel) {
          const isRemote = isRemoteModel(activeImageModel);
          return (
            <>
              <View style={styles.modelCardNameRow}>
                <Text style={styles.modelCardName} numberOfLines={1}>
                  {activeImageModel.name}
                </Text>
                {isRemote && (
                  <View style={styles.remoteBadge}>
                    <Icon name="wifi" size={10} color={colors.primary} />
                  </View>
                )}
              </View>
              {isOnnxImageModel(activeImageModel) ? (
                <Text style={styles.modelCardMeta}>
                  {activeImageModel.style || 'Ready'} · ~{((activeImageModel.size * 1.8) / (1024 * 1024 * 1024)).toFixed(1)} GB
                </Text>
              ) : (
                <Text style={styles.modelCardMeta}>
                  Remote · Vision
                </Text>
              )}
            </>
          );
        }
        return (
          <Text style={styles.modelCardEmpty}>
            {totalModels > 0 ? 'Tap to select' : 'No models'}
          </Text>
        );
      })()}
    </AnimatedPressable>
  );
};

type Props = {
  loadingState: LoadingState;
  activeTextModel: ActiveTextModel;
  activeImageModel: ActiveImageModel;
  downloadedModels: DownloadedModel[];
  downloadedImageModels: ONNXImageModel[];
  remoteTextModelsCount: number;
  remoteImageModelsCount: number;
  activeModelId: string | null;
  activeImageModelId: string | null;
  activeRemoteTextModelId: string | null;
  activeRemoteImageModelId: string | null;
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
  remoteTextModelsCount,
  remoteImageModelsCount,
  activeModelId,
  activeImageModelId,
  activeRemoteTextModelId,
  activeRemoteImageModelId,
  isEjecting,
  onPressTextModel,
  onPressImageModel,
  onEjectAll,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const hasActiveModel = activeModelId || activeImageModelId || activeRemoteTextModelId || activeRemoteImageModelId;

  return (
    <>
      <View style={styles.modelsRow}>
        <AttachStep index={1} style={attachStepStyles.flex}>
          <TextModelCard
            loadingState={loadingState}
            activeTextModel={activeTextModel}
            downloadedModels={downloadedModels}
            remoteModelsCount={remoteTextModelsCount}
            onPress={onPressTextModel}
          />
        </AttachStep>
        <AttachStep index={13} style={attachStepStyles.flex}>
          <ImageModelCard
            loadingState={loadingState}
            activeImageModel={activeImageModel}
            downloadedImageModels={downloadedImageModels}
            remoteModelsCount={remoteImageModelsCount}
            onPress={onPressImageModel}
          />
        </AttachStep>
      </View>
      {hasActiveModel && (
        <TouchableOpacity
          style={styles.ejectAllButton}
          onPress={onEjectAll}
          disabled={isEjecting || loadingState.isLoading}
        >
          {isEjecting ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <>
              <Icon name="power" size={14} color={colors.error} />
              <Text style={styles.ejectAllText}>Eject All Models</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </>
  );
};

const attachStepStyles = StyleSheet.create({
  flex: { flex: 1 },
});