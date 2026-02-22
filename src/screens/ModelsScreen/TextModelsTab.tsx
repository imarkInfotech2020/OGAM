import React from 'react';
import { View, Text, FlatList, TextInput, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { Card, ModelCard, Button } from '../../components';
import { AnimatedEntry } from '../../components/AnimatedEntry';
import { CustomAlert, hideAlert } from '../../components/CustomAlert';
import { useTheme, useThemedStyles } from '../../theme';
import { CREDIBILITY_LABELS } from '../../constants';
import { ModelInfo, ModelFile, DownloadedModel } from '../../types';
import { createStyles } from './styles';
import { ModelsScreenViewModel } from './useModelsScreen';
import { TextFiltersSection } from './TextFiltersSection';
import { FilterState } from './types';
import { formatNumber } from './utils';

type Props = Pick<ModelsScreenViewModel,
  | 'searchQuery' | 'setSearchQuery'
  | 'isLoading' | 'isRefreshing'
  | 'hasSearched'
  | 'selectedModel' | 'setSelectedModel'
  | 'modelFiles' | 'setModelFiles'
  | 'isLoadingFiles'
  | 'filterState'
  | 'textFiltersVisible' | 'setTextFiltersVisible'
  | 'filteredResults' | 'recommendedAsModelInfo'
  | 'ramGB' | 'deviceRecommendation'
  | 'hasActiveFilters'
  | 'downloadedModels' | 'downloadProgress'
  | 'alertState' | 'setAlertState'
  | 'focusTrigger'
  | 'handleSearch' | 'handleRefresh'
  | 'handleSelectModel' | 'handleDownload'
  | 'clearFilters'
  | 'toggleFilterDimension' | 'toggleOrg'
  | 'setTypeFilter' | 'setSourceFilter' | 'setSizeFilter' | 'setQuantFilter'
  | 'isModelDownloaded' | 'getDownloadedModel'
>;

interface DetailProps {
  selectedModel: ModelInfo;
  modelFiles: ModelFile[];
  isLoadingFiles: boolean;
  filterState: FilterState;
  ramGB: number;
  downloadProgress: Props['downloadProgress'];
  alertState: Props['alertState'];
  setAlertState: Props['setAlertState'];
  onBack: () => void;
  getDownloadedModel: (modelId: string, fileName: string) => DownloadedModel | undefined;
  isModelDownloaded: (modelId: string, fileName: string) => boolean;
  handleDownload: (model: ModelInfo, file: ModelFile) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useTheme>['colors'];
}

const ModelDetailView: React.FC<DetailProps> = ({
  selectedModel, modelFiles, isLoadingFiles, filterState, ramGB,
  downloadProgress, alertState, setAlertState, onBack,
  getDownloadedModel, isModelDownloaded, handleDownload, styles, colors,
}) => {
  const renderFileItem = ({ item, index }: { item: ModelFile; index: number }) => {
    const downloadKey = `${selectedModel.id}/${item.name}`;
    const progress = downloadProgress[downloadKey];
    return (
      <ModelCard
        model={{ id: selectedModel.id, name: item.name.replace('.gguf', ''), author: selectedModel.author, credibility: selectedModel.credibility }}
        file={item}
        downloadedModel={getDownloadedModel(selectedModel.id, item.name)}
        isDownloaded={isModelDownloaded(selectedModel.id, item.name)}
        isDownloading={!!progress}
        downloadProgress={progress?.progress}
        isCompatible={item.size / (1024 ** 3) < ramGB * 0.6}
        testID={`file-card-${index}`}
        onDownload={!isModelDownloaded(selectedModel.id, item.name) && !progress ? () => handleDownload(selectedModel, item) : undefined}
      />
    );
  };

  return (
    <View testID="model-detail-screen" style={styles.flex1}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} testID="model-detail-back" style={styles.backButton}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, styles.flex1]} numberOfLines={1}>{selectedModel.name}</Text>
      </View>
      <Card style={styles.modelInfoCard}>
        <View style={styles.authorRow}>
          <Text style={styles.modelAuthor}>{selectedModel.author}</Text>
          {selectedModel.credibility && (
            <View style={[styles.credibilityBadge, { backgroundColor: `${CREDIBILITY_LABELS[selectedModel.credibility.source].color}25` }]}>
              {selectedModel.credibility.source === 'lmstudio' && <Text style={[styles.credibilityIcon, { color: CREDIBILITY_LABELS[selectedModel.credibility.source].color }]}>★</Text>}
              {selectedModel.credibility.source === 'official' && <Text style={[styles.credibilityIcon, { color: CREDIBILITY_LABELS[selectedModel.credibility.source].color }]}>✓</Text>}
              {selectedModel.credibility.source === 'verified-quantizer' && <Text style={[styles.credibilityIcon, { color: CREDIBILITY_LABELS[selectedModel.credibility.source].color }]}>◆</Text>}
              <Text style={[styles.credibilityText, { color: CREDIBILITY_LABELS[selectedModel.credibility.source].color }]}>
                {CREDIBILITY_LABELS[selectedModel.credibility.source].label}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.modelDescription}>{selectedModel.description}</Text>
        <View style={styles.modelStats}>
          <Text style={styles.statText}>{formatNumber(selectedModel.downloads)} downloads</Text>
          <Text style={styles.statText}>{formatNumber(selectedModel.likes)} likes</Text>
        </View>
      </Card>
      <Text style={styles.sectionTitle}>Available Files</Text>
      <Text style={styles.sectionSubtitle}>
        Choose a quantization level. Q4_K_M is recommended for mobile.
        {modelFiles.some(f => f.mmProjFile) && ' Vision files include mmproj.'}
      </Text>
      {isLoadingFiles ? (
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={modelFiles.filter(f => f.size > 0 && f.size / (1024 ** 3) < ramGB * 0.6 && (filterState.quant === 'all' || f.name.includes(filterState.quant)))}
          renderItem={renderFileItem}
          keyExtractor={item => item.name}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Card style={styles.emptyCard}><Text style={styles.emptyText}>No compatible files found for this model.</Text></Card>}
        />
      )}
      <CustomAlert {...alertState} onClose={() => setAlertState(hideAlert())} />
    </View>
  );
};

export const TextModelsTab: React.FC<Props> = (props) => {
  const {
    searchQuery, setSearchQuery, isLoading, isRefreshing, hasSearched,
    selectedModel, setSelectedModel, modelFiles, setModelFiles, isLoadingFiles,
    filterState, textFiltersVisible, setTextFiltersVisible,
    filteredResults, recommendedAsModelInfo, ramGB, deviceRecommendation,
    hasActiveFilters, downloadedModels, downloadProgress,
    alertState, setAlertState, focusTrigger,
    handleSearch, handleRefresh, handleSelectModel, handleDownload,
    clearFilters, toggleFilterDimension, toggleOrg,
    setTypeFilter, setSourceFilter, setSizeFilter, setQuantFilter,
    isModelDownloaded, getDownloadedModel,
  } = props;

  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const renderModelItem = ({ item, index }: { item: ModelInfo; index: number }) => (
    <AnimatedEntry index={index} staggerMs={30} trigger={focusTrigger}>
      <ModelCard
        model={item}
        isDownloaded={downloadedModels.some(m => m.id.startsWith(item.id))}
        onPress={() => handleSelectModel(item)}
        testID={`model-card-${index}`}
        compact
      />
    </AnimatedEntry>
  );

  if (selectedModel) {
    return (
      <ModelDetailView
        selectedModel={selectedModel}
        modelFiles={modelFiles}
        isLoadingFiles={isLoadingFiles}
        filterState={filterState}
        ramGB={ramGB}
        downloadProgress={downloadProgress}
        alertState={alertState}
        setAlertState={setAlertState}
        onBack={() => { setSelectedModel(null); setModelFiles([]); }}
        getDownloadedModel={getDownloadedModel}
        isModelDownloaded={isModelDownloaded}
        handleDownload={handleDownload}
        styles={styles}
        colors={colors}
      />
    );
  }

  return (
    <>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search models..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          testID="search-input"
        />
        <TouchableOpacity
          style={[styles.filterToggle, (textFiltersVisible || hasActiveFilters) && styles.filterToggleActive]}
          onPress={() => setTextFiltersVisible(v => !v)}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          testID="text-filter-toggle"
        >
          <Icon name="sliders" size={14} color={(textFiltersVisible || hasActiveFilters) ? colors.primary : colors.textMuted} />
          {hasActiveFilters && <View style={styles.filterDot} />}
        </TouchableOpacity>
        <Button title="Search" size="small" onPress={handleSearch} testID="search-button" />
      </View>

      {textFiltersVisible && (
        <TextFiltersSection
          filterState={filterState}
          hasActiveFilters={hasActiveFilters}
          clearFilters={clearFilters}
          toggleFilterDimension={toggleFilterDimension}
          toggleOrg={toggleOrg}
          setTypeFilter={setTypeFilter}
          setSourceFilter={setSourceFilter}
          setSizeFilter={setSizeFilter}
          setQuantFilter={setQuantFilter}
        />
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading models...</Text>
        </View>
      ) : (
        <FlatList
          data={hasSearched ? filteredResults : recommendedAsModelInfo}
          renderItem={renderModelItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          testID="models-list"
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={!hasSearched ? (
            <View>
              <View style={styles.deviceBanner}>
                <Text style={styles.deviceBannerText}>
                  {Math.round(ramGB)}GB RAM — models up to {deviceRecommendation.maxParameters}B recommended ({deviceRecommendation.recommendedQuantization})
                </Text>
              </View>
              {recommendedAsModelInfo.length > 0 && <Text style={styles.recommendedTitle}>Recommended for your device</Text>}
            </View>
          ) : null}
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {hasSearched
                  ? hasActiveFilters ? 'No models match your filters. Try adjusting or clearing them.' : 'No models found. Try a different search term.'
                  : 'No recommended models available.'}
              </Text>
            </Card>
          }
        />
      )}
    </>
  );
};
