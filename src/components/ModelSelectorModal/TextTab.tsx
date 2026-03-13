import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { DownloadedModel, RemoteModel } from '../../types';
import { hardwareService } from '../../services';
import { createAllStyles } from './styles';

export interface TextTabProps {
  downloadedModels: DownloadedModel[];
  remoteModels: Array<{ serverId: string; serverName: string; models: RemoteModel[] }>;
  currentModelPath: string | null;
  currentRemoteModelId: string | null;
  isAnyLoading: boolean;
  onSelectModel: (model: DownloadedModel) => void;
  onSelectRemoteModel: (model: RemoteModel, serverId: string) => void;
  onUnloadModel: () => void;
  onAddServer: () => void;
}

export const TextTab: React.FC<TextTabProps> = ({
  downloadedModels, remoteModels, currentModelPath, currentRemoteModelId, isAnyLoading, onSelectModel, onUnloadModel, onSelectRemoteModel, onAddServer,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createAllStyles);
  const hasLoaded = currentModelPath !== null || currentRemoteModelId !== null;
  const activeLocalModel = downloadedModels.find(m => m.filePath === currentModelPath);

  // Find active remote model info
  const activeRemoteModelInfo = useMemo(() => {
    if (!currentRemoteModelId) return null;
    for (const group of remoteModels) {
      const model = group.models.find(m => m.id === currentRemoteModelId);
      if (model) return { model, serverName: group.serverName };
    }
    return null;
  }, [remoteModels, currentRemoteModelId]);

  return (
    <>
      {hasLoaded && (
        <View style={styles.loadedSection}>
          <View style={styles.loadedHeader}>
            <Icon name="check-circle" size={14} color={colors.success} />
            <Text style={styles.loadedLabel}>Currently Loaded</Text>
          </View>
          <View style={styles.loadedModelItem}>
            <View style={styles.loadedModelInfo}>
              <Text style={styles.loadedModelName} numberOfLines={1}>
                {activeLocalModel?.name || activeRemoteModelInfo?.model?.name || 'Unknown'}
              </Text>
              <Text style={styles.loadedModelMeta}>
                {activeLocalModel
                  ? `${activeLocalModel.quantization} • ${hardwareService.formatModelSize(activeLocalModel)}`
                  : `Remote • ${activeRemoteModelInfo?.serverName ?? 'Model'}`}
              </Text>
            </View>
            <TouchableOpacity style={styles.unloadButton} onPress={onUnloadModel} disabled={isAnyLoading}>
              <Icon name="power" size={16} color={colors.error} />
              <Text style={styles.unloadButtonText}>Unload</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.switchModelRow}>
        <Text style={styles.sectionTitle}>{hasLoaded ? 'Switch Model' : 'Available Models'}</Text>
        <TouchableOpacity style={styles.addServerInline} onPress={onAddServer} disabled={isAnyLoading}>
          <Icon name="plus" size={14} color={colors.primary} />
          <Text style={styles.addServerInlineText}>Add Server</Text>
        </TouchableOpacity>
      </View>

      {/* Empty state when no models at all */}
      {downloadedModels.length === 0 && remoteModels.length === 0 && (
        <View style={styles.emptyState}>
          <Icon name="package" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Text Models</Text>
          <Text style={styles.emptyText}>Download models from the Models tab</Text>
        </View>
      )}

      {/* Local Models Section */}
      {downloadedModels.length > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Icon name="hard-drive" size={14} color={colors.textMuted} />
            <Text style={styles.sectionSubTitle}>Local Models</Text>
          </View>
          {downloadedModels.map((model) => {
            const isCurrent = currentModelPath === model.filePath;
            return (
              <TouchableOpacity
                key={model.id}
                style={[styles.modelItem, isCurrent && styles.modelItemSelected]}
                onPress={() => onSelectModel(model)}
                disabled={isAnyLoading || isCurrent}
              >
                <View style={styles.modelInfo}>
                  <Text style={[styles.modelName, isCurrent && styles.modelNameSelected]} numberOfLines={1}>
                    {model.name}
                  </Text>
                  <View style={styles.modelMeta}>
                    <Text style={styles.modelSize}>{hardwareService.formatModelSize(model)}</Text>
                    {!!model.quantization && (
                      <>
                        <Text style={styles.metaSeparator}>•</Text>
                        <Text style={styles.modelQuant}>{model.quantization}</Text>
                      </>
                    )}
                    {model.isVisionModel && (
                      <>
                        <Text style={styles.metaSeparator}>•</Text>
                        <View style={styles.visionBadge}>
                          <Icon name="eye" size={10} color={colors.info} />
                          <Text style={styles.visionBadgeText}>Vision</Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
                {isCurrent && (
                  <View style={styles.checkmark}>
                    <Icon name="check" size={16} color={colors.background} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* Remote Models Sections */}
      {remoteModels.map(({ serverId, serverName, models }) => (
        <View key={serverId}>
          <View style={styles.sectionHeaderRow}>
            <Icon name="wifi" size={14} color={colors.textMuted} />
            <Text style={styles.sectionSubTitle}>{serverName}</Text>
          </View>
          {models.map((model) => {
            const isCurrent = currentRemoteModelId === model.id;
            return (
              <TouchableOpacity
                key={model.id}
                style={[styles.modelItem, isCurrent && styles.modelItemSelectedRemote]}
                onPress={() => onSelectRemoteModel(model, serverId)}
                disabled={isAnyLoading || isCurrent}
              >
                <View style={styles.modelInfo}>
                  <Text style={[styles.modelName, isCurrent && styles.modelNameSelectedRemote]} numberOfLines={1}>
                    {model.name}
                  </Text>
                  <View style={styles.modelMeta}>
                    <Text style={styles.remoteBadge}>Remote</Text>
                    {model.capabilities.supportsVision && (
                      <>
                        <Text style={styles.metaSeparator}>•</Text>
                        <View style={styles.visionBadge}>
                          <Icon name="eye" size={10} color={colors.info} />
                          <Text style={styles.visionBadgeText}>Vision</Text>
                        </View>
                      </>
                    )}
                    {model.capabilities.supportsToolCalling && (
                      <>
                        <Text style={styles.metaSeparator}>•</Text>
                        <View style={styles.toolBadge}>
                          <Icon name="tool" size={10} color={colors.warning} />
                        </View>
                      </>
                    )}
                  </View>
                </View>
                {isCurrent && (
                  <View style={styles.checkmarkRemote}>
                    <Icon name="check" size={16} color={colors.background} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </>
  );
};
