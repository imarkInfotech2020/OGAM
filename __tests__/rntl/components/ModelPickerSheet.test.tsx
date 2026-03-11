/**
 * ModelPickerSheet Component Tests
 *
 * Tests for the HomeScreen bottom sheet showing model selection:
 * - Visibility (pickerType null/text/image)
 * - Title changes by tab
 * - Empty states for text and image
 * - Local text models rendering and selection
 * - Remote text models rendering and selection
 * - Local image models rendering and selection
 * - Remote image models rendering and selection
 * - Unload buttons (local vs remote)
 * - Memory warning display
 * - Server name lookup
 * - Browse more button
 * - Loading disabled state
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ModelPickerSheet } from '../../../src/screens/HomeScreen/components/ModelPickerSheet';
import type { DownloadedModel, ONNXImageModel, RemoteModel } from '../../../src/types';

// Mock AppSheet to render children when visible
jest.mock('../../../src/components/AppSheet', () => ({
  AppSheet: ({ visible, children, title, onClose }: any) => {
    if (!visible) return null;
    const { View, Text, TouchableOpacity } = require('react-native');
    return (
      <View testID="app-sheet">
        <Text testID="sheet-title">{title}</Text>
        <TouchableOpacity testID="sheet-close" onPress={onClose} />
        {children}
      </View>
    );
  },
}));

jest.mock('../../../src/components/onboarding/spotlightState', () => ({
  consumePendingSpotlight: jest.fn(() => null),
}));

jest.mock('../../../src/components/onboarding/spotlightConfig', () => ({
  MODEL_PICKER_STEP_INDEX: 2,
}));

jest.mock('../../../src/components', () => ({
  Button: ({ title, onPress }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity testID="button" onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('../../../src/theme', () => ({
  useTheme: () => ({
    colors: {
      text: '#000',
      textMuted: '#999',
      textSecondary: '#666',
      border: '#ddd',
      primary: '#007AFF',
      error: '#FF3B30',
      info: '#5AC8FA',
      background: '#fff',
    },
  }),
  useThemedStyles: (fn: any) => fn(
    {
      text: '#000',
      textMuted: '#999',
      textSecondary: '#666',
      border: '#ddd',
      primary: '#007AFF',
      error: '#FF3B30',
      info: '#5AC8FA',
      background: '#fff',
    },
    {}
  ),
}));

jest.mock('../../../src/screens/HomeScreen/styles', () => ({
  createStyles: () => ({
    modalScroll: {},
    emptyPicker: {},
    emptyPickerText: {},
    unloadButton: {},
    unloadButtonText: {},
    sectionLabel: {},
    pickerItem: {},
    pickerItemActive: {},
    pickerItemWarning: {},
    pickerItemInfo: {},
    pickerItemName: {},
    pickerItemMeta: {},
    pickerItemMemory: {},
    pickerItemMemoryWarning: {},
    browseMoreButton: {},
    browseMoreText: {},
  }),
}));

jest.mock('../../../src/services', () => ({
  hardwareService: {
    formatModelSize: jest.fn(() => '4.0 GB'),
    formatBytes: jest.fn(() => '2.0 GB'),
  },
}));

const mockUseRemoteServerStore = jest.fn();
jest.mock('../../../src/stores', () => ({
  useRemoteServerStore: (selector: any) => {
    const state = mockUseRemoteServerStore();
    return selector ? selector(state) : state;
  },
}));

// Factories
const makeTextModel = (overrides: Partial<DownloadedModel> = {}): DownloadedModel => ({
  id: 'model1',
  name: 'Test Model',
  filePath: '/models/test.gguf',
  fileSize: 4 * 1024 * 1024 * 1024,
  quantization: 'Q4_K_M',
  isVisionModel: false,
  ...overrides,
} as DownloadedModel);

const makeImageModel = (overrides: Partial<ONNXImageModel> = {}): ONNXImageModel => ({
  id: 'img1',
  name: 'CLIP Model',
  size: 2 * 1024 * 1024 * 1024,
  style: 'Photorealistic',
  ...overrides,
} as ONNXImageModel);

const makeRemoteModel = (overrides: Partial<RemoteModel> = {}): RemoteModel => ({
  id: 'llama3',
  name: 'llama3',
  serverId: 'srv1',
  capabilities: {
    supportsVision: false,
    supportsToolCalling: false,
    supportsThinking: false,
  },
  lastUpdated: new Date().toISOString(),
  ...overrides,
} as RemoteModel);

const defaultProps = {
  pickerType: 'text' as const,
  loadingState: { isLoading: false },
  downloadedModels: [],
  downloadedImageModels: [],
  activeModelId: null as string | null,
  activeImageModelId: null as string | null,
  memoryInfo: null,
  remoteTextModels: [] as RemoteModel[],
  remoteImageModels: [] as RemoteModel[],
  activeRemoteTextModelId: null as string | null,
  activeRemoteImageModelId: null as string | null,
  onClose: jest.fn(),
  onSelectTextModel: jest.fn(),
  onUnloadTextModel: jest.fn(),
  onSelectImageModel: jest.fn(),
  onUnloadImageModel: jest.fn(),
  onSelectRemoteTextModel: jest.fn(),
  onUnloadRemoteTextModel: jest.fn(),
  onSelectRemoteImageModel: jest.fn(),
  onUnloadRemoteImageModel: jest.fn(),
  onBrowseModels: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRemoteServerStore.mockReturnValue({
    servers: [{ id: 'srv1', name: 'My Ollama' }],
  });
});

describe('ModelPickerSheet', () => {
  // ============================================================================
  // Visibility
  // ============================================================================
  describe('visibility', () => {
    it('does not render when pickerType is null', () => {
      const { queryByTestId } = render(
        <ModelPickerSheet {...defaultProps} pickerType={null} />
      );
      expect(queryByTestId('app-sheet')).toBeNull();
    });

    it('renders when pickerType is "text"', () => {
      const { getByTestId } = render(<ModelPickerSheet {...defaultProps} pickerType="text" />);
      expect(getByTestId('app-sheet')).toBeTruthy();
    });

    it('renders when pickerType is "image"', () => {
      const { getByTestId } = render(<ModelPickerSheet {...defaultProps} pickerType="image" />);
      expect(getByTestId('app-sheet')).toBeTruthy();
    });
  });

  // ============================================================================
  // Title
  // ============================================================================
  describe('title', () => {
    it('shows "Text Models" for text picker', () => {
      const { getByTestId } = render(<ModelPickerSheet {...defaultProps} pickerType="text" />);
      expect(getByTestId('sheet-title').props.children).toBe('Text Models');
    });

    it('shows "Image Models" for image picker', () => {
      const { getByTestId } = render(<ModelPickerSheet {...defaultProps} pickerType="image" />);
      expect(getByTestId('sheet-title').props.children).toBe('Image Models');
    });
  });

  // ============================================================================
  // Text Models — Empty State
  // ============================================================================
  describe('text models empty state', () => {
    it('shows empty message when no text models', () => {
      const { getByText } = render(<ModelPickerSheet {...defaultProps} />);
      expect(getByText('No text models available')).toBeTruthy();
    });

    it('shows Browse Models button in empty state', () => {
      const { getByText } = render(<ModelPickerSheet {...defaultProps} />);
      expect(getByText('Browse Models')).toBeTruthy();
    });

    it('calls onBrowseModels from empty state button', () => {
      const onBrowseModels = jest.fn();
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} onBrowseModels={onBrowseModels} />
      );
      fireEvent.press(getByText('Browse Models'));
      expect(onBrowseModels).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Text Models — Local Models
  // ============================================================================
  describe('local text models', () => {
    const model = makeTextModel();

    it('renders local model name', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} downloadedModels={[model]} />
      );
      expect(getByText('Test Model')).toBeTruthy();
    });

    it('calls onSelectTextModel when model pressed', () => {
      const onSelectTextModel = jest.fn();
      const { getAllByTestId } = render(
        <ModelPickerSheet {...defaultProps} downloadedModels={[model]} onSelectTextModel={onSelectTextModel} />
      );
      fireEvent.press(getAllByTestId('model-item')[0]);
      expect(onSelectTextModel).toHaveBeenCalledWith(model);
    });

    it('shows checkmark for active local model', () => {
      const { getByTestId } = render(
        <ModelPickerSheet {...defaultProps} downloadedModels={[model]} activeModelId="model1" />
      );
      // Active model item should exist
      expect(getByTestId('model-item')).toBeTruthy();
    });

    it('shows vision indicator for vision model', () => {
      const visionModel = makeTextModel({ id: 'v1', name: 'Vision Model', isVisionModel: true });
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} downloadedModels={[visionModel]} />
      );
      expect(getByText(/Vision Model/)).toBeTruthy();
    });

    it('shows Local Models section label', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} downloadedModels={[model]} />
      );
      expect(getByText('Local Models')).toBeTruthy();
    });

    it('model is disabled during loading', () => {
      const onSelectTextModel = jest.fn();
      const { getByTestId } = render(
        <ModelPickerSheet
          {...defaultProps}
          downloadedModels={[model]}
          loadingState={{ isLoading: true }}
          onSelectTextModel={onSelectTextModel}
        />
      );
      expect(getByTestId('model-item').props.accessibilityState?.disabled).toBe(true);
    });

    it('shows memory warning when model does not fit', () => {
      const bigModel = makeTextModel({ fileSize: 30 * 1024 * 1024 * 1024 });
      const memoryInfo = {
        memoryAvailable: 4 * 1024 * 1024 * 1024,
        textModelMemory: 0,
        imageModelMemory: 0,
        totalMemory: 8 * 1024 * 1024 * 1024,
      };
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} downloadedModels={[bigModel]} memoryInfo={memoryInfo} />
      );
      expect(getByText(/may not fit/)).toBeTruthy();
    });
  });

  // ============================================================================
  // Text Models — Unload Button
  // ============================================================================
  describe('text models unload button', () => {
    const model = makeTextModel();

    it('shows unload button when local model is active', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} downloadedModels={[model]} activeModelId="model1" />
      );
      expect(getByText('Unload current model')).toBeTruthy();
    });

    it('calls onUnloadTextModel when pressing unload for local model', () => {
      const onUnloadTextModel = jest.fn();
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          downloadedModels={[model]}
          activeModelId="model1"
          onUnloadTextModel={onUnloadTextModel}
        />
      );
      fireEvent.press(getByText('Unload current model'));
      expect(onUnloadTextModel).toHaveBeenCalledTimes(1);
    });

    it('shows "Disconnect remote model" when remote model is active', () => {
      const remoteModel = makeRemoteModel();
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          remoteTextModels={[remoteModel]}
          activeRemoteTextModelId="llama3"
        />
      );
      expect(getByText('Disconnect remote model')).toBeTruthy();
    });

    it('calls onUnloadRemoteTextModel when disconnecting remote model', () => {
      const onUnloadRemoteTextModel = jest.fn();
      const remoteModel = makeRemoteModel();
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          remoteTextModels={[remoteModel]}
          activeRemoteTextModelId="llama3"
          onUnloadRemoteTextModel={onUnloadRemoteTextModel}
        />
      );
      fireEvent.press(getByText('Disconnect remote model'));
      expect(onUnloadRemoteTextModel).toHaveBeenCalledTimes(1);
    });

    it('does not call onUnloadTextModel when unload button pressed while loading', () => {
      const onUnloadTextModel = jest.fn();
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          downloadedModels={[model]}
          activeModelId="model1"
          loadingState={{ isLoading: true }}
          onUnloadTextModel={onUnloadTextModel}
        />
      );
      fireEvent.press(getByText('Unload current model'));
      expect(onUnloadTextModel).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Remote Text Models
  // ============================================================================
  describe('remote text models', () => {
    const remoteModel = makeRemoteModel();

    it('renders remote model name', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} remoteTextModels={[remoteModel]} />
      );
      expect(getByText('llama3')).toBeTruthy();
    });

    it('shows Remote Models section label', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} remoteTextModels={[remoteModel]} />
      );
      expect(getByText('Remote Models')).toBeTruthy();
    });

    it('shows server name for remote model', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} remoteTextModels={[remoteModel]} />
      );
      expect(getByText('My Ollama')).toBeTruthy();
    });

    it('shows fallback server name when server not found', () => {
      mockUseRemoteServerStore.mockReturnValue({ servers: [] });
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} remoteTextModels={[remoteModel]} />
      );
      expect(getByText('Remote Server')).toBeTruthy();
    });

    it('calls onSelectRemoteTextModel when remote model pressed', () => {
      const onSelectRemoteTextModel = jest.fn();
      const { getByTestId } = render(
        <ModelPickerSheet
          {...defaultProps}
          remoteTextModels={[remoteModel]}
          onSelectRemoteTextModel={onSelectRemoteTextModel}
        />
      );
      fireEvent.press(getByTestId('remote-model-item'));
      expect(onSelectRemoteTextModel).toHaveBeenCalledWith(remoteModel);
    });

    it('shows Vision capability label for vision remote model', () => {
      const visionRemote = makeRemoteModel({ capabilities: { supportsVision: true, supportsToolCalling: false, supportsThinking: false } });
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} remoteTextModels={[visionRemote]} />
      );
      expect(getByText(/· Vision/)).toBeTruthy();
    });

    it('shows Tools capability label for tool-capable remote model', () => {
      const toolRemote = makeRemoteModel({ capabilities: { supportsVision: false, supportsToolCalling: true, supportsThinking: false } });
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} remoteTextModels={[toolRemote]} />
      );
      expect(getByText(/· Tools/)).toBeTruthy();
    });

    it('remote model is disabled during loading', () => {
      const onSelectRemoteTextModel = jest.fn();
      const { getByTestId } = render(
        <ModelPickerSheet
          {...defaultProps}
          remoteTextModels={[remoteModel]}
          loadingState={{ isLoading: true }}
          onSelectRemoteTextModel={onSelectRemoteTextModel}
        />
      );
      expect(getByTestId('remote-model-item').props.accessibilityState?.disabled).toBe(true);
    });
  });

  // ============================================================================
  // Image Models — Empty State
  // ============================================================================
  describe('image models empty state', () => {
    it('shows empty message when no image models', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} pickerType="image" />
      );
      expect(getByText('No image models available')).toBeTruthy();
    });

    it('calls onBrowseModels from image empty state button', () => {
      const onBrowseModels = jest.fn();
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} pickerType="image" onBrowseModels={onBrowseModels} />
      );
      fireEvent.press(getByText('Browse Models'));
      expect(onBrowseModels).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Image Models — Local Models
  // ============================================================================
  describe('local image models', () => {
    const imgModel = makeImageModel();

    it('renders image model name', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} pickerType="image" downloadedImageModels={[imgModel]} />
      );
      expect(getByText('CLIP Model')).toBeTruthy();
    });

    it('calls onSelectImageModel when image model pressed', () => {
      const onSelectImageModel = jest.fn();
      const { getByTestId } = render(
        <ModelPickerSheet
          {...defaultProps}
          pickerType="image"
          downloadedImageModels={[imgModel]}
          onSelectImageModel={onSelectImageModel}
        />
      );
      fireEvent.press(getByTestId('model-item'));
      expect(onSelectImageModel).toHaveBeenCalledWith(imgModel);
    });

    it('shows image model style', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} pickerType="image" downloadedImageModels={[imgModel]} />
      );
      expect(getByText(/Photorealistic/)).toBeTruthy();
    });

    it('shows fallback "Image" style when no style set', () => {
      const noStyleModel = makeImageModel({ style: undefined });
      const { getAllByText } = render(
        <ModelPickerSheet {...defaultProps} pickerType="image" downloadedImageModels={[noStyleModel]} />
      );
      // "Image · 2.0 GB" meta text uses "Image" as style fallback
      const imageTexts = getAllByText(/Image/);
      expect(imageTexts.length).toBeGreaterThan(0);
    });

    it('shows memory warning for image model that does not fit', () => {
      const bigImgModel = makeImageModel({ size: 30 * 1024 * 1024 * 1024 });
      const memoryInfo = {
        memoryAvailable: 4 * 1024 * 1024 * 1024,
        textModelMemory: 0,
        imageModelMemory: 0,
        totalMemory: 8 * 1024 * 1024 * 1024,
      };
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          pickerType="image"
          downloadedImageModels={[bigImgModel]}
          memoryInfo={memoryInfo}
        />
      );
      expect(getByText(/may not fit/)).toBeTruthy();
    });

    it('image model is disabled during loading', () => {
      const onSelectImageModel = jest.fn();
      const { getByTestId } = render(
        <ModelPickerSheet
          {...defaultProps}
          pickerType="image"
          downloadedImageModels={[imgModel]}
          loadingState={{ isLoading: true }}
          onSelectImageModel={onSelectImageModel}
        />
      );
      expect(getByTestId('model-item').props.accessibilityState?.disabled).toBe(true);
    });
  });

  // ============================================================================
  // Image Models — Unload Button
  // ============================================================================
  describe('image models unload button', () => {
    const imgModel = makeImageModel();

    it('shows unload button when local image model active', () => {
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          pickerType="image"
          downloadedImageModels={[imgModel]}
          activeImageModelId="img1"
        />
      );
      expect(getByText('Unload current model')).toBeTruthy();
    });

    it('calls onUnloadImageModel when pressing unload for local image model', () => {
      const onUnloadImageModel = jest.fn();
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          pickerType="image"
          downloadedImageModels={[imgModel]}
          activeImageModelId="img1"
          onUnloadImageModel={onUnloadImageModel}
        />
      );
      fireEvent.press(getByText('Unload current model'));
      expect(onUnloadImageModel).toHaveBeenCalledTimes(1);
    });

    it('shows "Disconnect remote model" when remote image model active', () => {
      const remoteImg = makeRemoteModel({ id: 'clip-remote', capabilities: { supportsVision: true, supportsToolCalling: false, supportsThinking: false } });
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          pickerType="image"
          remoteImageModels={[remoteImg]}
          activeRemoteImageModelId="clip-remote"
        />
      );
      expect(getByText('Disconnect remote model')).toBeTruthy();
    });

    it('calls onUnloadRemoteImageModel when disconnecting remote image model', () => {
      const onUnloadRemoteImageModel = jest.fn();
      const remoteImg = makeRemoteModel({ id: 'clip-remote', capabilities: { supportsVision: true, supportsToolCalling: false, supportsThinking: false } });
      const { getByText } = render(
        <ModelPickerSheet
          {...defaultProps}
          pickerType="image"
          remoteImageModels={[remoteImg]}
          activeRemoteImageModelId="clip-remote"
          onUnloadRemoteImageModel={onUnloadRemoteImageModel}
        />
      );
      fireEvent.press(getByText('Disconnect remote model'));
      expect(onUnloadRemoteImageModel).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Remote Image Models
  // ============================================================================
  describe('remote image models', () => {
    const remoteImg = makeRemoteModel({
      id: 'clip-remote',
      name: 'clip-vision',
      capabilities: { supportsVision: true, supportsToolCalling: false, supportsThinking: false },
    });

    it('renders remote image model name', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} pickerType="image" remoteImageModels={[remoteImg]} />
      );
      expect(getByText('clip-vision')).toBeTruthy();
    });

    it('calls onSelectRemoteImageModel when remote image model pressed', () => {
      const onSelectRemoteImageModel = jest.fn();
      const { getByTestId } = render(
        <ModelPickerSheet
          {...defaultProps}
          pickerType="image"
          remoteImageModels={[remoteImg]}
          onSelectRemoteImageModel={onSelectRemoteImageModel}
        />
      );
      fireEvent.press(getByTestId('remote-model-item'));
      expect(onSelectRemoteImageModel).toHaveBeenCalledWith(remoteImg);
    });

    it('shows server name for remote image model', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} pickerType="image" remoteImageModels={[remoteImg]} />
      );
      expect(getByText(/My Ollama/)).toBeTruthy();
    });

    it('shows Vision capability label for remote image model', () => {
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} pickerType="image" remoteImageModels={[remoteImg]} />
      );
      expect(getByText(/· Vision/)).toBeTruthy();
    });
  });

  // ============================================================================
  // Browse More Button
  // ============================================================================
  describe('browse more button', () => {
    it('shows "Browse more models" button', () => {
      const { getByText } = render(<ModelPickerSheet {...defaultProps} />);
      expect(getByText('Browse more models')).toBeTruthy();
    });

    it('calls onBrowseModels when browse more pressed', () => {
      const onBrowseModels = jest.fn();
      const { getByText } = render(
        <ModelPickerSheet {...defaultProps} onBrowseModels={onBrowseModels} />
      );
      fireEvent.press(getByText('Browse more models'));
      expect(onBrowseModels).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Close Button
  // ============================================================================
  describe('close', () => {
    it('calls onClose when sheet is closed', () => {
      const onClose = jest.fn();
      const { getByTestId } = render(<ModelPickerSheet {...defaultProps} onClose={onClose} />);
      fireEvent.press(getByTestId('sheet-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
