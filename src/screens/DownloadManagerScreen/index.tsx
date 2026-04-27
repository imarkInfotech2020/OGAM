import React from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { Card } from '../../components';
import { CustomAlert, hideAlert } from '../../components/CustomAlert';
import { useTheme, useThemedStyles } from '../../theme';
import { createStyles } from './styles';
import { ActiveDownloadCard, CompletedDownloadCard, formatBytes } from './items';
import { useDownloadManager } from './useDownloadManager';
import { useDownloadStore } from '../../stores/downloadStore';
import { hydrateDownloadStore } from '../../services/downloadHydration';
import logger from '../../utils/logger';

export const DownloadManagerScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const {
    activeItems,
    completedItems,
    alertState,
    setAlertState,
    handleRemoveDownload,
    handleRetryDownload,
    handleDeleteItem,
    handleRepairVision,
    isRepairingVision,
    totalStorageUsed,
  } = useDownloadManager();

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="downloaded-models-screen">
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} testID="back-button">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Download Manager</Text>
      </View>

      <FlatList
        data={[{ key: 'content' }]}
        renderItem={() => (
          <View style={styles.content}>
            {/* Active Downloads */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="download" size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>Active Downloads</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{activeItems.length}</Text>
                </View>
              </View>
              {activeItems.length > 0 ? (
                activeItems.map(item => (
                  <View key={`active-${item.modelId}-${item.fileName}`}>
                    <ActiveDownloadCard item={item} onRemove={handleRemoveDownload} onRetry={handleRetryDownload} />
                  </View>
                ))
              ) : (
                <Card style={styles.emptyCard}>
                  <Icon name="inbox" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No active downloads</Text>
                </Card>
              )}
            </View>

            {/* Completed Downloads */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="check-circle" size={18} color={colors.success} />
                <Text style={styles.sectionTitle}>Downloaded Models</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{completedItems.length}</Text>
                </View>
              </View>
              {completedItems.length > 0 ? (
                completedItems.map(item => (
                  <View key={`completed-${item.modelId}-${item.fileName}`}>
                    <CompletedDownloadCard item={item} onDelete={handleDeleteItem} onRepairVision={handleRepairVision} isRepairingVision={isRepairingVision(item.modelId)} />
                  </View>
                ))
              ) : (
                <Card style={styles.emptyCard}>
                  <Icon name="package" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No models downloaded yet</Text>
                  <Text style={styles.emptySubtext}>
                    Go to the Models tab to browse and download models
                  </Text>
                </Card>
              )}
            </View>

            {/* Debug Panel - DEV only */}
            {__DEV__ && (
              <View style={{ margin: 12, padding: 12, backgroundColor: '#1a1a2e', borderRadius: 8, borderWidth: 1, borderColor: '#ff6b6b' }}>
                <Text style={{ color: '#ff6b6b', fontWeight: '600', marginBottom: 8, fontSize: 12 }}>DEBUG PANEL</Text>

                <Text style={{ color: '#aaa', fontSize: 11, marginBottom: 6 }}>Simulate on first active download:</Text>

                {activeItems.length === 0 && (
                  <Text style={{ color: '#666', fontSize: 11, marginBottom: 6 }}>No active downloads - start one first</Text>
                )}

                {activeItems.length > 0 && (() => {
                  const item = activeItems[0];
                  const downloadId = item.downloadId!;
                  const modelKey = item.modelKey!;
                  return (
                    <View style={{ gap: 6 }}>
                      <Text style={{ color: '#888', fontSize: 10 }}>Target: {item.fileName.substring(0, 30)}...</Text>

                      <TouchableOpacity
                        style={{ backgroundColor: '#c0392b', padding: 8, borderRadius: 6 }}
                        onPress={() => {
                          logger.log('[DEBUG] Simulating finalization error for', downloadId);
                          useDownloadStore.getState().setStatus(downloadId, 'failed', { message: 'Simulated: unzip failed - file corrupted', code: 'file_corrupted' });
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11 }}>Simulate unzip/finalization failure</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: '#e67e22', padding: 8, borderRadius: 6 }}
                        onPress={() => {
                          logger.log('[DEBUG] Simulating network error for', downloadId);
                          useDownloadStore.getState().setStatus(downloadId, 'failed', { message: 'Simulated: network connection lost', code: 'network_lost' });
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11 }}>Simulate network error</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: '#8e44ad', padding: 8, borderRadius: 6 }}
                        onPress={() => {
                          logger.log('[DEBUG] Simulating stuck processing for', downloadId);
                          useDownloadStore.getState().setProcessing(downloadId);
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11 }}>Simulate stuck in processing</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: '#2980b9', padding: 8, borderRadius: 6 }}
                        onPress={() => {
                          logger.log('[DEBUG] Simulating app restart - clearing store then hydrating');
                          useDownloadStore.getState().setAll([]);
                          hydrateDownloadStore().then(() => {
                            logger.log('[DEBUG] Hydration complete. Store:', JSON.stringify(Object.keys(useDownloadStore.getState().downloads)));
                          });
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11 }}>Simulate app restart (clear + hydrate)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: '#27ae60', padding: 8, borderRadius: 6 }}
                        onPress={() => {
                          logger.log('[DEBUG] Simulating store wipe only (no hydration) for', modelKey);
                          useDownloadStore.getState().setAll([]);
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11 }}>Simulate store wipe (no hydration)</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>
            )}

            {/* Storage Info */}
            {completedItems.length > 0 && (
              <View style={styles.storageSection}>
                <View style={styles.storageRow}>
                  <Icon name="hard-drive" size={16} color={colors.textMuted} />
                  <Text style={styles.storageText}>
                    Total storage used: {formatBytes(totalStorageUsed)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.listContent}
      />

      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState(hideAlert())}
      />
    </SafeAreaView>
  );
};
