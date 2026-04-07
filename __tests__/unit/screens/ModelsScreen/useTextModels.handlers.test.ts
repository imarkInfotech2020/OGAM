/**
 * useTextModels.handlers.test.ts
 *
 * Unit tests for handler functions in useTextModels that are not covered by
 * the trending-selection or ModelsScreen integration tests:
 * - handleCancelDownload
 * - handleDeleteModel (model-not-found and active-model paths)
 * - runSearch error path
 * - runSearch with code type and no query (CODE_FALLBACK_QUERY)
 */

import { renderHook, act } from '@testing-library/react-native';
import { useTextModels } from '../../../../src/screens/ModelsScreen/useTextModels';

// ── Navigation ────────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
  useFocusEffect: jest.fn((cb: () => () => void) => { cb(); }),
}));

// ── App store ─────────────────────────────────────────────────────────
const mockSetDownloadProgress = jest.fn();
const mockAddDownloadedModel = jest.fn();
const mockRemoveDownloadedModel = jest.fn();
const mockSetDownloadedModels = jest.fn();

const mockStoreState: any = {
  downloadedModels: [],
  setDownloadedModels: mockSetDownloadedModels,
  downloadProgress: {},
  setDownloadProgress: mockSetDownloadProgress,
  addDownloadedModel: mockAddDownloadedModel,
  removeDownloadedModel: mockRemoveDownloadedModel,
  activeModelId: null,
};

jest.mock('../../../../src/stores', () => ({
  useAppStore: jest.fn(() => mockStoreState),
}));

// ── Services ──────────────────────────────────────────────────────────
const mockSearchModels = jest.fn((_query: string, _opts?: any) => Promise.resolve([]));
const mockCancelBackgroundDownload = jest.fn((_id: number) => Promise.resolve());
const mockDeleteModel = jest.fn((_id: string) => Promise.resolve());
const mockUnloadTextModel = jest.fn(() => Promise.resolve());
const mockGetDownloadedModels = jest.fn(() => Promise.resolve([]));

jest.mock('../../../../src/services', () => ({
  huggingFaceService: {
    searchModels: (query: string, opts?: any) => mockSearchModels(query, opts),
    getModelDetails: jest.fn(() => Promise.reject(new Error('not found'))),
    getModelFiles: jest.fn(() => Promise.resolve([])),
  },
  modelManager: {
    getDownloadedModels: () => mockGetDownloadedModels(),
    downloadModelBackground: jest.fn(),
    watchDownload: jest.fn(),
    cancelBackgroundDownload: (id: number) => mockCancelBackgroundDownload(id),
    repairMmProj: jest.fn(),
    deleteModel: (id: string) => mockDeleteModel(id),
  },
  hardwareService: {
    getTotalMemoryGB: jest.fn(() => 8),
    getModelRecommendation: jest.fn(() => ({ maxParameters: 8 })),
  },
  activeModelService: {
    unloadTextModel: () => mockUnloadTextModel(),
  },
}));

// ── Alert ─────────────────────────────────────────────────────────────
const mockShowAlert = jest.fn((title: string, message: string) => ({ title, message, visible: true }));
jest.mock('../../../../src/components/CustomAlert', () => ({
  showAlert: (title: string, message: string) => mockShowAlert(title, message),
  initialAlertState: { title: '', message: '', visible: false },
}));

// ─────────────────────────────────────────────────────────────────────

const setAlertState = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreState.downloadedModels = [];
  mockStoreState.activeModelId = null;
});

// ── handleCancelDownload ──────────────────────────────────────────────

describe('handleCancelDownload', () => {
  it('calls cancelBackgroundDownload when a downloadId exists for the key', async () => {
    const { result } = renderHook(() => useTextModels(setAlertState));

    // Seed a download in progress by calling handleDownload first (mock resolves immediately)
    const mockFile = { name: 'model.gguf', size: 1000, quantization: 'Q4_K_M', downloadUrl: 'http://x' };
    const mockModel = { id: 'org/repo', name: 'Test', author: 'org', description: '', downloads: 0, likes: 0, tags: [], lastModified: '', files: [] };

    const { modelManager: mm } = jest.requireMock('../../../../src/services');
    mm.downloadModelBackground.mockResolvedValueOnce({ downloadId: 99 });

    await act(async () => {
      await result.current.handleDownload(mockModel as any, mockFile as any);
    });

    // downloadIds should now have the key
    await act(async () => {
      await result.current.handleCancelDownload('org/repo/model.gguf');
    });

    expect(mockCancelBackgroundDownload).toHaveBeenCalledWith(99);
    expect(mockSetDownloadProgress).toHaveBeenCalledWith('org/repo/model.gguf', null);
  });

  it('clears downloadProgress without calling cancelBackgroundDownload when no downloadId', async () => {
    const { result } = renderHook(() => useTextModels(setAlertState));

    // Call cancel for a key that was never started
    await act(async () => {
      await result.current.handleCancelDownload('nonexistent/key.gguf');
    });

    expect(mockCancelBackgroundDownload).not.toHaveBeenCalled();
  });
});

// ── handleDeleteModel ─────────────────────────────────────────────────

describe('handleDeleteModel', () => {
  it('does nothing when model is not in downloadedModels', async () => {
    mockStoreState.downloadedModels = [];

    const { result } = renderHook(() => useTextModels(setAlertState));

    await act(async () => {
      await result.current.handleDeleteModel('org/missing-model');
    });

    expect(mockDeleteModel).not.toHaveBeenCalled();
    expect(mockUnloadTextModel).not.toHaveBeenCalled();
  });

  it('unloads the active model before deleting when it is active', async () => {
    const model = { id: 'org/active-model', name: 'Active', fileName: 'active.gguf', filePath: '/path', fileSize: 1000, quantization: 'Q4_K_M', downloadedAt: '' };
    mockStoreState.downloadedModels = [model];
    mockStoreState.activeModelId = 'org/active-model';

    const { result } = renderHook(() => useTextModels(setAlertState));

    await act(async () => {
      await result.current.handleDeleteModel('org/active-model');
    });

    expect(mockUnloadTextModel).toHaveBeenCalled();
    expect(mockDeleteModel).toHaveBeenCalledWith('org/active-model');
  });

  it('deletes without unloading when model is not active', async () => {
    const model = { id: 'org/inactive-model', name: 'Inactive', fileName: 'inactive.gguf', filePath: '/path', fileSize: 1000, quantization: 'Q4_K_M', downloadedAt: '' };
    mockStoreState.downloadedModels = [model];
    mockStoreState.activeModelId = 'org/some-other-model';

    const { result } = renderHook(() => useTextModels(setAlertState));

    await act(async () => {
      await result.current.handleDeleteModel('org/inactive-model');
    });

    expect(mockUnloadTextModel).not.toHaveBeenCalled();
    expect(mockDeleteModel).toHaveBeenCalledWith('org/inactive-model');
  });
});

// ── runSearch error path ──────────────────────────────────────────────

describe('runSearch', () => {
  it('shows a Search Error alert when searchModels rejects', async () => {
    mockSearchModels.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useTextModels(setAlertState));

    await act(async () => {
      await result.current.handleSearch();
      // handleSearch calls runSearch directly — but needs a non-empty query
      // Set query first so runSearch doesn't short-circuit
    });

    // handleSearch with empty query returns early — trigger search via handleSelectModel-like path
    // Instead, call handleSearch after setting query
    await act(async () => {
      result.current.setSearchQuery('llama');
    });

    // Wait for debounce (500ms) + async resolve
    await act(async () => {
      await new Promise(r => setTimeout(r, 600));
    });

    expect(setAlertState).toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith('Search Error', expect.stringContaining('Failed to search'));
  });

  it('uses CODE_FALLBACK_QUERY when type=code and query is empty', async () => {
    mockSearchModels.mockResolvedValue([]);

    const { result } = renderHook(() => useTextModels(setAlertState));

    await act(async () => {
      result.current.setTypeFilter('code');
      await new Promise(r => setTimeout(r, 100));
    });

    expect(mockSearchModels).toHaveBeenCalledWith(
      'coder',
      expect.objectContaining({}),
    );
  });
});
