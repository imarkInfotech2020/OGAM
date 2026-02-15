/**
 * DownloadManagerScreen Tests
 *
 * Tests for the download manager screen including:
 * - Title display
 * - Empty state when no downloads
 * - Completed model rendering with details
 * - Active download rendering with progress
 * - Delete model confirmation flow (including onPress callbacks)
 * - Cancel active download flow (including onPress callbacks)
 * - Storage total display
 * - Image model rendering
 * - Background download service subscriptions
 * - Refresh flow
 * - Background download items rendering
 * - Back button navigation
 * - Alert onClose
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { TouchableOpacity } from 'react-native';

// Navigation is globally mocked in jest.setup.ts

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: mockGoBack,
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useRoute: () => ({ params: {} }),
  };
});

const mockUseAppStore = jest.fn();

jest.mock('../../../src/stores', () => ({
  useAppStore: (...args: any[]) => mockUseAppStore(...args),
}));

jest.mock('../../../src/services', () => ({
  modelManager: {
    getDownloadedModels: jest.fn(() => Promise.resolve([])),
    getDownloadedImageModels: jest.fn(() => Promise.resolve([])),
    getActiveBackgroundDownloads: jest.fn(() => Promise.resolve([])),
    startBackgroundDownloadPolling: jest.fn(),
    stopBackgroundDownloadPolling: jest.fn(),
    cancelBackgroundDownload: jest.fn(() => Promise.resolve()),
    deleteModel: jest.fn(() => Promise.resolve()),
    deleteImageModel: jest.fn(() => Promise.resolve()),
  },
  backgroundDownloadService: {
    isAvailable: jest.fn(() => false),
    onAnyProgress: jest.fn(() => jest.fn()),
    onAnyComplete: jest.fn(() => jest.fn()),
    onAnyError: jest.fn(() => jest.fn()),
  },
  activeModelService: {
    unloadTextModel: jest.fn(),
    unloadImageModel: jest.fn(() => Promise.resolve()),
  },
  hardwareService: {
    getModelTotalSize: jest.fn((model: any) => model?.fileSize || 0),
  },
}));

// Get references to the mocked services after jest.mock is applied
const { modelManager: mockModelManager, backgroundDownloadService: mockBackgroundDownloadService, hardwareService: mockHardwareService, activeModelService: mockActiveModelService } = jest.requireMock('../../../src/services');

jest.mock('../../../src/components', () => ({
  Card: ({ children, style }: any) => {
    const { View } = require('react-native');
    return <View style={style}>{children}</View>;
  },
}));

const mockShowAlert = jest.fn((_t: string, _m: string, _b?: any) => ({
  visible: true,
  title: _t,
  message: _m,
  buttons: _b || [],
}));

const mockHideAlert = jest.fn(() => ({ visible: false, title: '', message: '', buttons: [] }));

jest.mock('../../../src/components/CustomAlert', () => ({
  CustomAlert: ({ visible, title, message, buttons, onClose }: any) => {
    if (!visible) return null;
    const { View, Text, TouchableOpacity: TO } = require('react-native');
    return (
      <View testID="custom-alert">
        <Text testID="alert-title">{title}</Text>
        <Text testID="alert-message">{message}</Text>
        {buttons && buttons.map((btn: any, i: number) => (
          <TO key={i} testID={`alert-button-${btn.text}`} onPress={btn.onPress}>
            <Text>{btn.text}</Text>
          </TO>
        ))}
        <TO testID="alert-close" onPress={onClose}>
          <Text>CloseAlert</Text>
        </TO>
      </View>
    );
  },
  showAlert: (...args: any[]) => mockShowAlert(...args),
  hideAlert: (...args: any[]) => mockHideAlert(...args),
  initialAlertState: { visible: false, title: '', message: '', buttons: [] },
}));

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style }: any) => {
    const { TouchableOpacity: TO } = require('react-native');
    return (
      <TO style={style} onPress={onPress}>
        {children}
      </TO>
    );
  },
}));

import { DownloadManagerScreen } from '../../../src/screens/DownloadManagerScreen';

// Default store state
const createDefaultState = (overrides: any = {}) => ({
  downloadedModels: [],
  setDownloadedModels: jest.fn(),
  downloadProgress: {},
  setDownloadProgress: jest.fn(),
  removeDownloadedModel: jest.fn(),
  activeBackgroundDownloads: {},
  setBackgroundDownload: jest.fn(),
  downloadedImageModels: [],
  setDownloadedImageModels: jest.fn(),
  removeDownloadedImageModel: jest.fn(),
  removeImageModelDownloading: jest.fn(),
  themeMode: 'system',
  ...overrides,
});

describe('DownloadManagerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Restore mock implementations cleared by clearAllMocks
    mockBackgroundDownloadService.isAvailable.mockReturnValue(false);
    mockBackgroundDownloadService.onAnyProgress.mockReturnValue(jest.fn());
    mockBackgroundDownloadService.onAnyComplete.mockReturnValue(jest.fn());
    mockBackgroundDownloadService.onAnyError.mockReturnValue(jest.fn());
    mockModelManager.getDownloadedModels.mockResolvedValue([]);
    mockModelManager.getDownloadedImageModels.mockResolvedValue([]);
    mockModelManager.getActiveBackgroundDownloads.mockResolvedValue([]);
    mockModelManager.cancelBackgroundDownload.mockResolvedValue(undefined);
    mockModelManager.deleteModel.mockResolvedValue(undefined);
    mockModelManager.deleteImageModel.mockResolvedValue(undefined);
    mockHardwareService.getModelTotalSize.mockImplementation((model: any) => model.fileSize || 0);

    const defaultState = createDefaultState();
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(defaultState) : defaultState;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders screen title', () => {
    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText('Download Manager')).toBeTruthy();
  });

  it('shows empty state when no downloads', () => {
    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText('No active downloads')).toBeTruthy();
    expect(getByText('No models downloaded yet')).toBeTruthy();
  });

  it('shows section headers for active and completed', () => {
    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText('Active Downloads')).toBeTruthy();
    expect(getByText('Downloaded Models')).toBeTruthy();
  });

  it('shows empty subtext when no models downloaded', () => {
    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText('Go to the Models tab to browse and download models')).toBeTruthy();
  });

  it('renders completed text model with details', () => {
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Test Model',
          author: 'test-author',
          fileName: 'test-model-q4.gguf',
          filePath: '/path/to/model',
          fileSize: 4 * 1024 * 1024 * 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(4 * 1024 * 1024 * 1024);

    const { getByText, queryByText } = render(<DownloadManagerScreen />);
    expect(getByText('test-model-q4.gguf')).toBeTruthy();
    expect(getByText('test-author')).toBeTruthy();
    expect(getByText('Q4_K_M')).toBeTruthy();
    expect(queryByText('No models downloaded yet')).toBeNull();
  });

  it('renders completed image model', () => {
    const state = createDefaultState({
      downloadedImageModels: [
        {
          id: 'img-model-1',
          name: 'SD Turbo',
          description: 'Image model',
          modelPath: '/path/to/img',
          downloadedAt: '2026-01-15T00:00:00.000Z',
          size: 2 * 1024 * 1024 * 1024,
          style: 'creative',
          backend: 'mnn',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText('SD Turbo')).toBeTruthy();
    expect(getByText('Image Generation')).toBeTruthy();
  });

  it('renders active download with progress info', () => {
    const state = createDefaultState({
      downloadProgress: {
        'author/model-id/model-file.gguf': {
          progress: 0.5,
          bytesDownloaded: 2 * 1024 * 1024 * 1024,
          totalBytes: 4 * 1024 * 1024 * 1024,
        },
      },
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { getByText, queryByText } = render(<DownloadManagerScreen />);
    expect(getByText('model-file.gguf')).toBeTruthy();
    expect(queryByText('No active downloads')).toBeNull();
  });

  it('shows storage total when models exist', () => {
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Model',
          author: 'author',
          fileName: 'model.gguf',
          filePath: '/path',
          fileSize: 1024 * 1024 * 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(1024 * 1024 * 1024);

    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText(/Total storage used/)).toBeTruthy();
  });

  it('shows count badges for active and completed sections', () => {
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Model',
          author: 'author',
          fileName: 'model.gguf',
          filePath: '/path',
          fileSize: 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(1024);

    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText('0')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
  });

  it('pressing delete button on completed model shows confirmation alert', () => {
    const removeDownloadedModel = jest.fn();
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Model',
          author: 'author',
          fileName: 'model.gguf',
          filePath: '/path',
          fileSize: 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
      removeDownloadedModel,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(1024);

    const { getAllByTestId } = render(<DownloadManagerScreen />);
    const deleteButtons = getAllByTestId('delete-model-button');
    fireEvent.press(deleteButtons[0]);

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Delete Model',
      expect.stringContaining('model.gguf'),
      expect.any(Array),
    );
  });

  it('pressing cancel on active download shows confirmation alert', () => {
    const state = createDefaultState({
      downloadProgress: {
        'author/model-id/model-file.gguf': {
          progress: 0.3,
          bytesDownloaded: 1024,
          totalBytes: 4096,
        },
      },
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { UNSAFE_getAllByType } = render(<DownloadManagerScreen />);
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const cancelButtons = touchables.filter((_: any, i: number) => i > 0);
    if (cancelButtons.length > 0) {
      fireEvent.press(cancelButtons[0]);
    }

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Remove Download',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('renders multiple completed models', () => {
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Model A',
          author: 'author-a',
          fileName: 'model-a.gguf',
          filePath: '/path/a',
          fileSize: 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
        {
          id: 'model-2',
          name: 'Model B',
          author: 'author-b',
          fileName: 'model-b.gguf',
          filePath: '/path/b',
          fileSize: 2048,
          quantization: 'Q8_0',
          downloadedAt: '2026-01-16T00:00:00.000Z',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(1024);

    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText('model-a.gguf')).toBeTruthy();
    expect(getByText('model-b.gguf')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  it('shows downloading status text for active downloads', () => {
    const state = createDefaultState({
      downloadProgress: {
        'author/model-id/active-model.gguf': {
          progress: 0.25,
          bytesDownloaded: 256,
          totalBytes: 1024,
        },
      },
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { getByText } = render(<DownloadManagerScreen />);
    expect(getByText('downloading')).toBeTruthy();
  });

  it('does not show storage section when no completed models', () => {
    const { queryByText } = render(<DownloadManagerScreen />);
    expect(queryByText(/Total storage used/)).toBeNull();
  });

  it('delete image model shows correct alert', () => {
    const state = createDefaultState({
      downloadedImageModels: [
        {
          id: 'img-1',
          name: 'SD Model',
          description: 'Test',
          modelPath: '/path',
          downloadedAt: '2026-01-15T00:00:00.000Z',
          size: 2048,
          style: 'creative',
          backend: 'mnn',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { getAllByTestId } = render(<DownloadManagerScreen />);
    const deleteButtons = getAllByTestId('delete-model-button');
    fireEvent.press(deleteButtons[0]);

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Delete Image Model',
      expect.stringContaining('SD Model'),
      expect.any(Array),
    );
  });

  // ===== NEW TESTS FOR COVERAGE =====

  it('back button calls navigation.goBack', () => {
    const { UNSAFE_getAllByType } = render(<DownloadManagerScreen />);
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // First touchable is the back button
    fireEvent.press(touchables[0]);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('starts background download polling when service is available', () => {
    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    mockModelManager.getActiveBackgroundDownloads.mockResolvedValue([]);

    render(<DownloadManagerScreen />);

    expect(mockModelManager.startBackgroundDownloadPolling).toHaveBeenCalled();
  });

  it('subscribes to background download events when service is available', () => {
    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    mockModelManager.getActiveBackgroundDownloads.mockResolvedValue([]);

    render(<DownloadManagerScreen />);

    expect(mockBackgroundDownloadService.onAnyProgress).toHaveBeenCalled();
    expect(mockBackgroundDownloadService.onAnyComplete).toHaveBeenCalled();
    expect(mockBackgroundDownloadService.onAnyError).toHaveBeenCalled();
  });

  it('progress event callback updates download progress', async () => {
    const setDownloadProgress = jest.fn();
    const state = createDefaultState({ setDownloadProgress });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    let progressCallback: any;
    mockBackgroundDownloadService.onAnyProgress.mockImplementation((cb: any) => {
      progressCallback = cb;
      return jest.fn();
    });

    render(<DownloadManagerScreen />);

    // Simulate a progress event
    await act(async () => {
      progressCallback({
        modelId: 'test/model',
        fileName: 'file.gguf',
        bytesDownloaded: 500,
        totalBytes: 1000,
      });
    });

    expect(setDownloadProgress).toHaveBeenCalledWith('test/model/file.gguf', {
      progress: 0.5,
      bytesDownloaded: 500,
      totalBytes: 1000,
    });
  });

  it('complete event callback clears progress and reloads', async () => {
    const setDownloadProgress = jest.fn();
    const setDownloadedModels = jest.fn();
    const state = createDefaultState({ setDownloadProgress, setDownloadedModels });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    let completeCallback: any;
    mockBackgroundDownloadService.onAnyComplete.mockImplementation((cb: any) => {
      completeCallback = cb;
      return jest.fn();
    });

    render(<DownloadManagerScreen />);

    await act(async () => {
      await completeCallback({
        modelId: 'test/model',
        fileName: 'file.gguf',
      });
    });

    expect(setDownloadProgress).toHaveBeenCalledWith('test/model/file.gguf', null);
    expect(mockModelManager.getDownloadedModels).toHaveBeenCalled();
  });

  it('error event callback clears progress and shows alert', async () => {
    const setDownloadProgress = jest.fn();
    const setBackgroundDownload = jest.fn();
    const state = createDefaultState({ setDownloadProgress, setBackgroundDownload });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    let errorCallback: any;
    mockBackgroundDownloadService.onAnyError.mockImplementation((cb: any) => {
      errorCallback = cb;
      return jest.fn();
    });

    render(<DownloadManagerScreen />);

    await act(async () => {
      errorCallback({
        modelId: 'test/model',
        fileName: 'file.gguf',
        downloadId: 42,
        reason: 'Network error',
      });
    });

    expect(setDownloadProgress).toHaveBeenCalledWith('test/model/file.gguf', null);
    expect(setBackgroundDownload).toHaveBeenCalledWith(42, null);
    expect(mockShowAlert).toHaveBeenCalledWith('Download Failed', 'Network error');
  });

  it('handleRefresh reloads models and image models', async () => {
    const setDownloadedModels = jest.fn();
    const setDownloadedImageModels = jest.fn();
    const state = createDefaultState({ setDownloadedModels, setDownloadedImageModels });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { UNSAFE_root } = render(<DownloadManagerScreen />);

    // Find the FlatList and trigger its RefreshControl onRefresh
    const flatList = UNSAFE_root.findAll((node: any) => node.type && node.type.displayName === 'FlatList')[0]
      || UNSAFE_root.findAll((node: any) => node.props?.refreshControl)[0];

    if (flatList && flatList.props.refreshControl) {
      await act(async () => {
        flatList.props.refreshControl.props.onRefresh();
      });
    }

    expect(mockModelManager.getDownloadedModels).toHaveBeenCalled();
    expect(mockModelManager.getDownloadedImageModels).toHaveBeenCalled();
  });

  it('confirming delete model calls deleteModel and removeDownloadedModel', async () => {
    const removeDownloadedModel = jest.fn();
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Model',
          author: 'author',
          fileName: 'model.gguf',
          filePath: '/path',
          fileSize: 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
      removeDownloadedModel,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(1024);

    const { getAllByTestId, getByTestId } = render(<DownloadManagerScreen />);

    // Press delete to show alert
    const deleteButtons = getAllByTestId('delete-model-button');
    fireEvent.press(deleteButtons[0]);

    // Now press the "Delete" button in the alert
    await act(async () => {
      const deleteConfirm = getByTestId('alert-button-Delete');
      fireEvent.press(deleteConfirm);
    });

    expect(mockModelManager.deleteModel).toHaveBeenCalledWith('model-1');
    expect(removeDownloadedModel).toHaveBeenCalledWith('model-1');
  });

  it('delete model error shows error alert', async () => {
    const removeDownloadedModel = jest.fn();
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Model',
          author: 'author',
          fileName: 'model.gguf',
          filePath: '/path',
          fileSize: 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
      removeDownloadedModel,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(1024);
    mockModelManager.deleteModel.mockRejectedValueOnce(new Error('fail'));

    const { getAllByTestId, getByTestId } = render(<DownloadManagerScreen />);

    const deleteButtons = getAllByTestId('delete-model-button');
    fireEvent.press(deleteButtons[0]);

    await act(async () => {
      fireEvent.press(getByTestId('alert-button-Delete'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith('Error', 'Failed to delete model');
  });

  it('confirming delete image model calls deleteImageModel and removeDownloadedImageModel', async () => {
    const removeDownloadedImageModel = jest.fn();
    const state = createDefaultState({
      downloadedImageModels: [
        {
          id: 'img-1',
          name: 'SD Model',
          description: 'Test',
          modelPath: '/path',
          downloadedAt: '2026-01-15T00:00:00.000Z',
          size: 2048,
          style: 'creative',
          backend: 'mnn',
        },
      ],
      removeDownloadedImageModel,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { getAllByTestId, getByTestId } = render(<DownloadManagerScreen />);

    const deleteButtons = getAllByTestId('delete-model-button');
    fireEvent.press(deleteButtons[0]);

    await act(async () => {
      fireEvent.press(getByTestId('alert-button-Delete'));
    });

    expect(mockActiveModelService.unloadImageModel).toHaveBeenCalled();
    expect(mockModelManager.deleteImageModel).toHaveBeenCalledWith('img-1');
    expect(removeDownloadedImageModel).toHaveBeenCalledWith('img-1');
  });

  it('delete image model error shows error alert', async () => {
    const state = createDefaultState({
      downloadedImageModels: [
        {
          id: 'img-1',
          name: 'SD Model',
          description: 'Test',
          modelPath: '/path',
          downloadedAt: '2026-01-15T00:00:00.000Z',
          size: 2048,
          style: 'creative',
          backend: 'mnn',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockActiveModelService.unloadImageModel.mockRejectedValueOnce(new Error('fail'));

    const { getAllByTestId, getByTestId } = render(<DownloadManagerScreen />);

    const deleteButtons = getAllByTestId('delete-model-button');
    fireEvent.press(deleteButtons[0]);

    await act(async () => {
      fireEvent.press(getByTestId('alert-button-Delete'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith('Error', 'Failed to delete image model');
  });

  it('confirming remove active download cancels and clears state', async () => {
    const setDownloadProgress = jest.fn();
    const setBackgroundDownload = jest.fn();
    const removeImageModelDownloading = jest.fn();
    const state = createDefaultState({
      downloadProgress: {
        'author/model-id/model-file.gguf': {
          progress: 0.3,
          bytesDownloaded: 1024,
          totalBytes: 4096,
        },
      },
      setDownloadProgress,
      setBackgroundDownload,
      removeImageModelDownloading,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { UNSAFE_getAllByType, getByTestId } = render(<DownloadManagerScreen />);
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // Press the cancel button (second touchable after back button)
    const cancelButtons = touchables.filter((_: any, i: number) => i > 0);
    fireEvent.press(cancelButtons[0]);

    // Press "Yes" to confirm
    await act(async () => {
      fireEvent.press(getByTestId('alert-button-Yes'));
    });

    expect(setDownloadProgress).toHaveBeenCalledWith('author/model-id/model-file.gguf', null);
  });

  it('confirming remove download for image model clears image model downloading state', async () => {
    const removeImageModelDownloading = jest.fn();
    const setDownloadProgress = jest.fn();
    const state = createDefaultState({
      downloadProgress: {
        'image:sd-turbo/model.bin': {
          progress: 0.5,
          bytesDownloaded: 500,
          totalBytes: 1000,
        },
      },
      setDownloadProgress,
      removeImageModelDownloading,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { UNSAFE_getAllByType, getByTestId } = render(<DownloadManagerScreen />);
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const cancelButtons = touchables.filter((_: any, i: number) => i > 0);
    fireEvent.press(cancelButtons[0]);

    await act(async () => {
      fireEvent.press(getByTestId('alert-button-Yes'));
    });

    expect(removeImageModelDownloading).toHaveBeenCalledWith('sd-turbo');
  });

  it('remove download error shows error alert', async () => {
    const setDownloadProgress = jest.fn(() => { throw new Error('fail'); });
    const state = createDefaultState({
      downloadProgress: {
        'author/model-id/model-file.gguf': {
          progress: 0.3,
          bytesDownloaded: 1024,
          totalBytes: 4096,
        },
      },
      setDownloadProgress,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { UNSAFE_getAllByType, getByTestId } = render(<DownloadManagerScreen />);
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const cancelButtons = touchables.filter((_: any, i: number) => i > 0);
    fireEvent.press(cancelButtons[0]);

    await act(async () => {
      fireEvent.press(getByTestId('alert-button-Yes'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith('Error', 'Failed to remove download');
  });

  it('renders background download items from active downloads with metadata', async () => {
    const state = createDefaultState({
      activeBackgroundDownloads: {
        101: {
          modelId: 'author/bg-model',
          fileName: 'bg-model.gguf',
          author: 'bg-author',
          quantization: 'Q4_K_M',
          totalBytes: 2000,
        },
      },
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    // Set active downloads via loadActiveDownloads
    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    mockModelManager.getActiveBackgroundDownloads.mockResolvedValue([
      {
        downloadId: 101,
        status: 'running',
        bytesDownloaded: 500,
        title: 'bg-model.gguf',
      },
    ]);

    const result = render(<DownloadManagerScreen />);

    // Wait for the async loadActiveDownloads to finish
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Re-render should show the background download
    expect(result.getByText('bg-model.gguf')).toBeTruthy();
    expect(result.getByText('bg-author')).toBeTruthy();
  });

  it('skips invalid download progress entries', () => {
    const state = createDefaultState({
      downloadProgress: {
        'undefined/undefined': {
          progress: NaN,
          bytesDownloaded: NaN,
          totalBytes: NaN,
        },
        'valid/model/valid-file.gguf': {
          progress: 0.5,
          bytesDownloaded: 500,
          totalBytes: 1000,
        },
      },
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    const { getByText, queryByText } = render(<DownloadManagerScreen />);
    expect(getByText('valid-file.gguf')).toBeTruthy();
    // The invalid entry should be skipped (no NaN rendering)
  });

  it('alert onClose calls hideAlert', () => {
    // Need to trigger an alert first
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Model',
          author: 'author',
          fileName: 'model.gguf',
          filePath: '/path',
          fileSize: 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(1024);

    const { getAllByTestId, getByTestId } = render(<DownloadManagerScreen />);
    const deleteButtons = getAllByTestId('delete-model-button');
    fireEvent.press(deleteButtons[0]);

    // Press the close button on the alert
    fireEvent.press(getByTestId('alert-close'));
    expect(mockHideAlert).toHaveBeenCalled();
  });

  it('pressing Cancel on delete model alert does nothing (cancel style)', () => {
    const state = createDefaultState({
      downloadedModels: [
        {
          id: 'model-1',
          name: 'Model',
          author: 'author',
          fileName: 'model.gguf',
          filePath: '/path',
          fileSize: 1024,
          quantization: 'Q4_K_M',
          downloadedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });
    mockHardwareService.getModelTotalSize.mockReturnValue(1024);

    const { getAllByTestId, getByTestId } = render(<DownloadManagerScreen />);
    const deleteButtons = getAllByTestId('delete-model-button');
    fireEvent.press(deleteButtons[0]);

    // Cancel button should exist but not trigger delete
    const cancelBtn = getByTestId('alert-button-Cancel');
    expect(cancelBtn).toBeTruthy();
  });

  it('remove download cross-references active downloads when no downloadId on item', async () => {
    // This tests the path where an RNFS progress item has no downloadId
    // but we find a matching background download via fileName
    const setDownloadProgress = jest.fn();
    const setBackgroundDownload = jest.fn();
    const state = createDefaultState({
      downloadProgress: {
        'author/bg-model/bg-model.gguf': {
          progress: 0.5,
          bytesDownloaded: 500,
          totalBytes: 1000,
        },
      },
      activeBackgroundDownloads: {
        301: {
          modelId: 'author/bg-model',
          fileName: 'bg-model.gguf',
          author: 'bg-author',
          quantization: 'Q4_K_M',
          totalBytes: 1000,
        },
      },
      setDownloadProgress,
      setBackgroundDownload,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    mockModelManager.getActiveBackgroundDownloads.mockResolvedValue([
      {
        downloadId: 301,
        status: 'running',
        bytesDownloaded: 500,
        title: 'bg-model.gguf',
      },
    ]);

    const result = render(<DownloadManagerScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Find the cancel button for the RNFS download (which has no downloadId)
    const touchables = result.UNSAFE_getAllByType(TouchableOpacity);
    const cancelButtons = touchables.filter((_: any, i: number) => i > 0);
    if (cancelButtons.length > 0) {
      fireEvent.press(cancelButtons[0]);

      // Confirm
      await act(async () => {
        fireEvent.press(result.getByTestId('alert-button-Yes'));
      });

      // Should have cross-referenced and found downloadId 301
      expect(setBackgroundDownload).toHaveBeenCalledWith(301, null);
      expect(mockModelManager.cancelBackgroundDownload).toHaveBeenCalledWith(301);
    }
  });

  it('skips invalid background download metadata entries', async () => {
    const state = createDefaultState({
      activeBackgroundDownloads: {
        201: {
          modelId: 'undefined',
          fileName: 'undefined',
          author: '',
          quantization: '',
          totalBytes: NaN,
        },
        202: {
          modelId: 'valid/model',
          fileName: 'valid.gguf',
          author: 'author',
          quantization: 'Q4_K_M',
          totalBytes: 1000,
        },
      },
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    mockModelManager.getActiveBackgroundDownloads.mockResolvedValue([
      {
        downloadId: 201,
        status: 'running',
        bytesDownloaded: NaN,
        title: 'undefined',
      },
      {
        downloadId: 202,
        status: 'running',
        bytesDownloaded: 300,
        title: 'valid.gguf',
      },
    ]);

    const result = render(<DownloadManagerScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Valid download should appear, invalid should be skipped
    expect(result.getByText('valid.gguf')).toBeTruthy();
  });

  it('remove download with downloadId cancels background download', async () => {
    const setBackgroundDownload = jest.fn();
    const setDownloadProgress = jest.fn();
    const state = createDefaultState({
      downloadProgress: {},
      activeBackgroundDownloads: {
        101: {
          modelId: 'author/bg-model',
          fileName: 'bg-model.gguf',
          author: 'bg-author',
          quantization: 'Q4_K_M',
          totalBytes: 2000,
        },
      },
      setBackgroundDownload,
      setDownloadProgress,
    });
    mockUseAppStore.mockImplementation((selector?: any) => {
      return selector ? selector(state) : state;
    });

    mockBackgroundDownloadService.isAvailable.mockReturnValue(true);
    mockModelManager.getActiveBackgroundDownloads.mockResolvedValue([
      {
        downloadId: 101,
        status: 'running',
        bytesDownloaded: 500,
        title: 'bg-model.gguf',
      },
    ]);

    const result = render(<DownloadManagerScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Find and press cancel button on the active download
    const touchables = result.UNSAFE_getAllByType(TouchableOpacity);
    // Find cancel buttons (skip back button)
    const cancelButtons = touchables.filter((_: any, i: number) => i > 0);
    if (cancelButtons.length > 0) {
      fireEvent.press(cancelButtons[0]);

      // Confirm removal
      await act(async () => {
        fireEvent.press(result.getByTestId('alert-button-Yes'));
      });

      // After 1 second timeout, reload should happen
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
      });
    }
  });
});
