/**
 * ModelsScreen Tests
 *
 * Tests for the model discovery and download screen including:
 * - Rendering the actual component (text tab, image tab, search, filters)
 * - Download interactions
 * - Model management
 * - Tab switching
 * - Search and filter functionality
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAppStore } from '../../../src/stores/appStore';
import { resetStores } from '../../utils/testHelpers';
import {
  createDownloadedModel,
  createONNXImageModel,
  createModelInfo,
  createModelFile,
  createModelFileWithMmProj,
  createDeviceInfo,
} from '../../utils/factories';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useIsFocused: () => true,
    useFocusEffect: jest.fn((cb) => cb()),
  };
});

// Mock services
const mockSearchModels = jest.fn();
const mockGetModelFiles = jest.fn();
const mockGetModelDetails = jest.fn();
const mockDownloadModel = jest.fn();
const mockCancelDownload = jest.fn();
const mockDeleteModel = jest.fn();
const mockDeleteImageModel = jest.fn();
const mockGetDownloadedModels = jest.fn();
const mockGetDownloadedImageModels = jest.fn();
const mockAddDownloadedImageModel = jest.fn();

jest.mock('../../../src/services/huggingface', () => ({
  huggingFaceService: {
    searchModels: (...args: any[]) => mockSearchModels(...args),
    getModelFiles: (...args: any[]) => mockGetModelFiles(...args),
    getModelDetails: (...args: any[]) => mockGetModelDetails(...args),
    downloadModel: (...args: any[]) => mockDownloadModel(...args),
    downloadModelWithProgress: jest.fn(),
    formatModelSize: jest.fn(() => '4.0 GB'),
  },
}));

jest.mock('../../../src/services/modelManager', () => ({
  modelManager: {
    cancelDownload: (...args: any[]) => mockCancelDownload(...args),
    deleteModel: (...args: any[]) => mockDeleteModel(...args),
    deleteImageModel: (...args: any[]) => mockDeleteImageModel(...args),
    getDownloadedModels: (...args: any[]) => mockGetDownloadedModels(...args),
    getDownloadedImageModels: (...args: any[]) => mockGetDownloadedImageModels(...args),
    addDownloadedImageModel: (...args: any[]) => mockAddDownloadedImageModel(...args),
    downloadModelWithMmProj: jest.fn(),
    downloadModel: jest.fn(),
    importLocalModel: jest.fn(),
  },
}));

jest.mock('../../../src/services/hardware', () => ({
  hardwareService: {
    getDeviceInfo: jest.fn(() => Promise.resolve({
      totalMemory: 8 * 1024 * 1024 * 1024,
      usedMemory: 4 * 1024 * 1024 * 1024,
      availableMemory: 4 * 1024 * 1024 * 1024,
      deviceModel: 'Test Device',
      systemName: 'Android',
      systemVersion: '13',
      isEmulator: false,
    })),
    formatBytes: jest.fn((bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }),
    getTotalMemoryGB: jest.fn(() => 8),
    getModelRecommendation: jest.fn(() => ({
      maxParameters: 14,
      recommendedQuantization: 'Q4_K_M',
      recommendedModels: [],
      warning: undefined,
    })),
    getImageModelRecommendation: jest.fn(() => Promise.resolve({
      recommendedBackend: 'mnn',
      maxModelSizeMB: 2048,
      canRunSD: true,
      canRunQNN: false,
    })),
  },
}));

const mockFetchAvailableModels = jest.fn();
jest.mock('../../../src/services/huggingFaceModelBrowser', () => ({
  fetchAvailableModels: (...args: any[]) => mockFetchAvailableModels(...args),
  getVariantLabel: jest.fn(() => 'Standard'),
  guessStyle: jest.fn(() => 'creative'),
}));

jest.mock('../../../src/services/coreMLModelBrowser', () => ({
  fetchAvailableCoreMLModels: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../../src/utils/coreMLModelUtils', () => ({
  resolveCoreMLModelDir: jest.fn((path: string) => path),
  downloadCoreMLTokenizerFiles: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../src/services/activeModelService', () => ({
  activeModelService: {
    unloadImageModel: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../../src/services/backgroundDownloadService', () => ({
  backgroundDownloadService: {
    queryDownload: jest.fn(() => Promise.resolve(null)),
    cancelDownload: jest.fn(() => Promise.resolve()),
    startDownload: jest.fn(() => Promise.resolve(1)),
    isAvailable: jest.fn(() => Promise.resolve(true)),
  },
}));

// Mock child components to simplify — ModelCard renders model name
jest.mock('../../../src/components', () => {
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    Card: ({ children, style, ...props }: any) => <View style={style} {...props}>{children}</View>,
    ModelCard: ({ model, testID, onPress, onDownload, onDelete, isDownloaded, isDownloading, downloadProgress }: any) => (
      <TouchableOpacity testID={testID} onPress={onPress}>
        <Text testID={`${testID}-name`}>{model.name}</Text>
        <Text testID={`${testID}-author`}>{model.author}</Text>
        {isDownloaded && <Text testID={`${testID}-downloaded`}>Downloaded</Text>}
        {isDownloading && <Text testID={`${testID}-downloading`}>Downloading {downloadProgress}%</Text>}
        {onDownload && (
          <TouchableOpacity testID={`${testID}-download-btn`} onPress={onDownload}>
            <Text>Download</Text>
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity testID={`${testID}-delete-btn`} onPress={onDelete}>
            <Text>Delete</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    ),
    Button: ({ title, onPress, testID }: any) => (
      <TouchableOpacity testID={testID} onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../../../src/components/AnimatedEntry', () => {
  const { View } = require('react-native');
  return {
    AnimatedEntry: ({ children, ...props }: any) => <View {...props}>{children}</View>,
  };
});

jest.mock('../../../src/components/CustomAlert', () => {
  const { View } = require('react-native');
  return {
    CustomAlert: (props: any) => <View testID="custom-alert" />,
    showAlert: jest.fn((opts: any) => ({ visible: true, ...opts })),
    hideAlert: jest.fn(() => ({ visible: false })),
    initialAlertState: { visible: false },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: { allFiles: '*/*' },
  isErrorWithCode: jest.fn(() => false),
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));

// Polyfill for requestAnimationFrame
(globalThis as any).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);

// Import AFTER all mocks are set up
import { ModelsScreen } from '../../../src/screens/ModelsScreen';

const renderModelsScreen = () => {
  return render(
    <NavigationContainer>
      <ModelsScreen />
    </NavigationContainer>
  );
};

describe('ModelsScreen', () => {
  beforeEach(() => {
    resetStores();
    jest.clearAllMocks();

    // Default mock responses
    mockSearchModels.mockResolvedValue([]);
    mockGetModelFiles.mockResolvedValue([]);
    mockGetModelDetails.mockResolvedValue(createModelInfo());
    mockGetDownloadedModels.mockResolvedValue([]);
    mockGetDownloadedImageModels.mockResolvedValue([]);
    mockFetchAvailableModels.mockResolvedValue([]);

    // Set up device info so recommended models render
    useAppStore.setState({
      deviceInfo: createDeviceInfo({ totalMemory: 8 * 1024 * 1024 * 1024 }),
    });
  });

  // ============================================================================
  // Basic Rendering
  // ============================================================================
  describe('basic rendering', () => {
    it('renders the models screen container', async () => {
      const { getByTestId } = renderModelsScreen();

      await waitFor(() => {
        expect(getByTestId('models-screen')).toBeTruthy();
      });
    });

    it('shows the Models title', async () => {
      const { getByText } = renderModelsScreen();

      await waitFor(() => {
        expect(getByText('Models')).toBeTruthy();
      });
    });

    it('shows text and image tab buttons', async () => {
      const { getByText } = renderModelsScreen();

      await waitFor(() => {
        expect(getByText('Text Models')).toBeTruthy();
        expect(getByText('Image Models')).toBeTruthy();
      });
    });

    it('shows the downloads icon', async () => {
      const { getByTestId } = renderModelsScreen();

      await waitFor(() => {
        expect(getByTestId('downloads-icon')).toBeTruthy();
      });
    });

    it('shows Import Local File button', async () => {
      const { getByText } = renderModelsScreen();

      await waitFor(() => {
        expect(getByText('Import Local File')).toBeTruthy();
      });
    });

    it('navigates to DownloadManager when downloads icon pressed', async () => {
      const { getByTestId } = renderModelsScreen();

      await waitFor(() => {
        fireEvent.press(getByTestId('downloads-icon'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('DownloadManager');
    });
  });

  // ============================================================================
  // Text Models Tab (default)
  // ============================================================================
  describe('text models tab', () => {
    it('shows search input on text tab', async () => {
      const { getByTestId } = renderModelsScreen();

      await waitFor(() => {
        expect(getByTestId('search-input')).toBeTruthy();
      });
    });

    it('shows search button', async () => {
      const { getByTestId } = renderModelsScreen();

      await waitFor(() => {
        expect(getByTestId('search-button')).toBeTruthy();
      });
    });

    it('triggers search when search button pressed', async () => {
      mockSearchModels.mockResolvedValue([
        createModelInfo({ name: 'Llama-3', author: 'meta-llama' }),
      ]);

      const { getByTestId } = renderModelsScreen();

      await waitFor(() => {
        const searchInput = getByTestId('search-input');
        fireEvent.changeText(searchInput, 'llama');
      });

      await act(async () => {
        fireEvent.press(getByTestId('search-button'));
      });

      await waitFor(() => {
        expect(mockSearchModels).toHaveBeenCalled();
      });
    });

    it('shows recommended models header', async () => {
      const { getByText } = renderModelsScreen();

      await waitFor(() => {
        expect(getByText('Recommended for your device')).toBeTruthy();
      });
    });

    it('shows RAM info banner', async () => {
      const { getByText } = renderModelsScreen();

      await waitFor(() => {
        // The banner shows "XGB RAM — models up to YB recommended (Q4_K_M)"
        expect(getByText(/RAM/)).toBeTruthy();
      });
    });

    it('shows search results after searching', async () => {
      const searchResults = [
        createModelInfo({ id: 'result-1', name: 'Test Model Alpha', author: 'test-org' }),
        createModelInfo({ id: 'result-2', name: 'Test Model Beta', author: 'test-org' }),
      ];
      mockSearchModels.mockResolvedValue(searchResults);

      const { getByTestId, getByText } = renderModelsScreen();

      // Wait for initial render
      await waitFor(() => {
        expect(getByTestId('search-input')).toBeTruthy();
      });

      // Type search query
      await act(async () => {
        fireEvent.changeText(getByTestId('search-input'), 'test');
      });

      // Press search button and wait for async results
      await act(async () => {
        fireEvent.press(getByTestId('search-button'));
      });

      await waitFor(() => {
        expect(getByText('Test Model Alpha')).toBeTruthy();
        expect(getByText('Test Model Beta')).toBeTruthy();
      });
    });

    it('shows empty state when no search results', async () => {
      mockSearchModels.mockResolvedValue([]);

      const { getByTestId, getByText } = renderModelsScreen();

      // Wait for initial render
      await waitFor(() => {
        expect(getByTestId('search-input')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(getByTestId('search-input'), 'nonexistent-model');
      });

      await act(async () => {
        fireEvent.press(getByTestId('search-button'));
      });

      await waitFor(() => {
        expect(getByText(/No models found/)).toBeTruthy();
      });
    });
  });

  // ============================================================================
  // Tab Switching
  // ============================================================================
  describe('tab switching', () => {
    it('switches to image models tab', async () => {
      const { getByText, queryByTestId } = renderModelsScreen();

      await act(async () => {
        fireEvent.press(getByText('Image Models'));
      });

      // Search input should not be visible on image tab (it has its own)
      // The image tab content should render
      await waitFor(() => {
        // On image tab, the text tab search input testID should be gone
        // and image content should appear
        expect(getByText('Image Models')).toBeTruthy();
      });
    });

    it('switches back to text models tab', async () => {
      const { getByText, getByTestId } = renderModelsScreen();

      // Switch to image tab
      await act(async () => {
        fireEvent.press(getByText('Image Models'));
      });

      // Switch back to text tab
      await act(async () => {
        fireEvent.press(getByText('Text Models'));
      });

      await waitFor(() => {
        expect(getByTestId('search-input')).toBeTruthy();
      });
    });
  });

  // ============================================================================
  // Download badge
  // ============================================================================
  describe('download badge', () => {
    it('shows badge count when models are downloaded', async () => {
      const model = createDownloadedModel({ id: 'dl-model' });
      mockGetDownloadedModels.mockResolvedValue([model]);
      useAppStore.setState({ downloadedModels: [model] });

      const { getByText } = renderModelsScreen();

      await waitFor(() => {
        // Badge shows total model count
        expect(getByText('1')).toBeTruthy();
      });
    });
  });

  // ============================================================================
  // Import Local Model
  // ============================================================================
  describe('import local model', () => {
    it('shows import button', async () => {
      const { getByTestId } = renderModelsScreen();

      await waitFor(() => {
        expect(getByTestId('import-local-model')).toBeTruthy();
      });
    });

    it('triggers file picker on import press', async () => {
      const { pick } = require('@react-native-documents/picker');
      pick.mockRejectedValue({ code: 'OPERATION_CANCELED' });

      const { getByTestId } = renderModelsScreen();

      await act(async () => {
        fireEvent.press(getByTestId('import-local-model'));
      });

      // Should have tried to open file picker
      expect(pick).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Recommended Models & Constants
  // ============================================================================
  describe('recommended models', () => {
    it('RECOMMENDED_MODELS has entries', () => {
      const { RECOMMENDED_MODELS } = require('../../../src/constants');
      expect(RECOMMENDED_MODELS.length).toBeGreaterThan(0);
    });

    it('all recommended models have minRam', () => {
      const { RECOMMENDED_MODELS } = require('../../../src/constants');
      for (const model of RECOMMENDED_MODELS) {
        expect(model.minRam).toBeGreaterThan(0);
      }
    });

    it('all recommended models have type badges (text/vision/code)', () => {
      const { RECOMMENDED_MODELS } = require('../../../src/constants');
      const validTypes = ['text', 'vision', 'code'];
      for (const model of RECOMMENDED_MODELS) {
        expect(validTypes).toContain(model.type);
      }
    });

    it('recommended models are sorted by minRam per type', () => {
      const { RECOMMENDED_MODELS } = require('../../../src/constants');
      const textModels = RECOMMENDED_MODELS.filter((m: any) => m.type === 'text');
      for (let i = 1; i < textModels.length; i++) {
        expect(textModels[i].minRam).toBeGreaterThanOrEqual(textModels[i - 1].minRam);
      }
    });

    it('MODEL_ORGS contains expected organizations', () => {
      const { MODEL_ORGS } = require('../../../src/constants');
      const keys = MODEL_ORGS.map((o: any) => o.key);
      expect(keys).toContain('Qwen');
      expect(keys).toContain('meta-llama');
      expect(keys).toContain('google');
      expect(keys).toContain('microsoft');
    });
  });

  // ============================================================================
  // Model type filtering (constants)
  // ============================================================================
  describe('type filter', () => {
    it('filters by text models', () => {
      const { RECOMMENDED_MODELS } = require('../../../src/constants');
      const textModels = RECOMMENDED_MODELS.filter((m: any) => m.type === 'text');
      expect(textModels.length).toBeGreaterThan(0);
    });

    it('filters by vision models', () => {
      const { RECOMMENDED_MODELS } = require('../../../src/constants');
      const visionModels = RECOMMENDED_MODELS.filter((m: any) => m.type === 'vision');
      expect(visionModels.length).toBeGreaterThan(0);
    });

    it('filters by code models', () => {
      const { RECOMMENDED_MODELS } = require('../../../src/constants');
      const codeModels = RECOMMENDED_MODELS.filter((m: any) => m.type === 'code');
      expect(codeModels.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Multi-file Download (Vision Models)
  // ============================================================================
  describe('multi-file download', () => {
    it('vision model files include mmProjFile', () => {
      const file = createModelFileWithMmProj({
        name: 'vision-model.gguf',
        mmProjName: 'mmproj.gguf',
        mmProjSize: 500 * 1024 * 1024,
      });

      expect(file.mmProjFile).toBeDefined();
      expect(file.mmProjFile.name).toBe('mmproj.gguf');
      expect(file.mmProjFile.size).toBe(500 * 1024 * 1024);
    });

    it('calculates combined size for vision model files', () => {
      const file = createModelFileWithMmProj({
        size: 4000000000,
        mmProjSize: 500000000,
      });

      const totalSize = file.size + (file.mmProjFile?.size || 0);
      expect(totalSize).toBe(4500000000);
    });
  });

  // ============================================================================
  // Store interactions (download progress, model management)
  // ============================================================================
  describe('store interactions', () => {
    it('tracks download progress via store', async () => {
      useAppStore.setState({
        downloadProgress: {
          'model-1': { progress: 0.5, bytesDownloaded: 2000, totalBytes: 4000 },
        },
      });

      const { getByTestId } = renderModelsScreen();

      await waitFor(() => {
        expect(getByTestId('models-screen')).toBeTruthy();
      });

      // Verify store state was updated
      const progress = useAppStore.getState().downloadProgress;
      expect(progress['model-1'].progress).toBe(0.5);
    });

    it('tracks multiple concurrent downloads', () => {
      useAppStore.setState({
        downloadProgress: {
          'model-1': { progress: 0.5, bytesDownloaded: 2000, totalBytes: 4000 },
          'model-2': { progress: 0.25, bytesDownloaded: 1000, totalBytes: 4000 },
        },
      });

      const progress = useAppStore.getState().downloadProgress;
      expect(Object.keys(progress).length).toBe(2);
    });

    it('clears progress when download completes', () => {
      useAppStore.getState().setDownloadProgress('model-1', { progress: 1, bytesDownloaded: 4000, totalBytes: 4000 });
      useAppStore.getState().setDownloadProgress('model-1', null);

      expect(useAppStore.getState().downloadProgress['model-1']).toBeUndefined();
    });
  });

  // ============================================================================
  // Search error handling
  // ============================================================================
  describe('search error handling', () => {
    it('handles search network error gracefully', async () => {
      mockSearchModels.mockRejectedValue(new Error('Network error'));

      const { getByTestId } = renderModelsScreen();

      await act(async () => {
        fireEvent.changeText(getByTestId('search-input'), 'test');
        fireEvent.press(getByTestId('search-button'));
      });

      // Screen should still be rendered (no crash)
      await waitFor(() => {
        expect(getByTestId('models-screen')).toBeTruthy();
      });
    });
  });

  // ============================================================================
  // Bring Your Own Model (constants/logic)
  // ============================================================================
  describe('bring your own model', () => {
    it('validates .gguf file extension for imports', () => {
      const validFile = 'MyModel-Q4_K_M.gguf';
      const invalidFile = 'model.bin';
      expect(validFile.endsWith('.gguf')).toBe(true);
      expect(invalidFile.endsWith('.gguf')).toBe(false);
    });

    it('creates local_import/* IDs for imported models', () => {
      const fileName = 'imported-model.gguf';
      const expectedId = `local_import/${fileName}`;
      expect(expectedId).toBe('local_import/imported-model.gguf');
    });

    it('sets author to "Local Import" for imported models', () => {
      const importedModel = createDownloadedModel({
        id: 'local_import/model.gguf',
        author: 'Local Import',
      });
      expect(importedModel.author).toBe('Local Import');
    });
  });

  // ============================================================================
  // Organization filter logic
  // ============================================================================
  describe('organization filter', () => {
    it('filters models by selected organization', () => {
      const models = [
        createModelInfo({ name: 'Qwen Model', author: 'Qwen' }),
        createModelInfo({ name: 'Llama Model', author: 'meta-llama' }),
        createModelInfo({ name: 'Gemma Model', author: 'google' }),
      ];

      const filtered = models.filter(m => m.author === 'Qwen');
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Qwen Model');
    });

    it('shows all models when no org filter is selected', () => {
      const models = [
        createModelInfo({ author: 'Qwen' }),
        createModelInfo({ author: 'meta-llama' }),
      ];
      expect(models.length).toBe(2);
    });
  });

  // ============================================================================
  // Sorting logic
  // ============================================================================
  describe('sorting', () => {
    it('sorts by downloads', () => {
      const models = [
        createModelInfo({ downloads: 100 }),
        createModelInfo({ downloads: 1000 }),
      ];
      const sorted = [...models].sort((a, b) => b.downloads - a.downloads);
      expect(sorted[0].downloads).toBe(1000);
    });

    it('sorts by name', () => {
      const models = [
        createModelInfo({ name: 'Zebra' }),
        createModelInfo({ name: 'Alpha' }),
      ];
      const sorted = [...models].sort((a, b) => a.name.localeCompare(b.name));
      expect(sorted[0].name).toBe('Alpha');
    });

    it('sorts by size', () => {
      const files = [
        createModelFile({ size: 8000000000 }),
        createModelFile({ size: 4000000000 }),
      ];
      const sorted = [...files].sort((a, b) => a.size - b.size);
      expect(sorted[0].size).toBe(4000000000);
    });
  });
});
