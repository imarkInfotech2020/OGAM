/**
 * Tests for cache type nudge shown after first successful generation.
 */

import {
  startGenerationFn,
} from '../../../src/screens/ChatScreen/useChatGenerationActions';
import { createDownloadedModel } from '../../utils/factories';

// ─────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────

jest.mock('../../../src/services/huggingface', () => ({ huggingFaceService: {} }));
jest.mock('../../../src/services/modelManager', () => ({ modelManager: {} }));
jest.mock('../../../src/services/hardware', () => ({ hardwareService: {} }));
jest.mock('../../../src/services/backgroundDownloadService', () => ({
  backgroundDownloadService: { isAvailable: jest.fn(() => false) },
}));
jest.mock('../../../src/services/activeModelService/index', () => ({
  activeModelService: { loadTextModel: jest.fn(), unloadTextModel: jest.fn() },
}));
jest.mock('../../../src/services/intentClassifier', () => ({
  intentClassifier: { classifyIntent: jest.fn() },
}));
jest.mock('../../../src/services/generationService', () => ({
  generationService: {
    generateResponse: jest.fn(),
    generateWithTools: jest.fn(),
    stopGeneration: jest.fn(),
    enqueueMessage: jest.fn(),
    getState: jest.fn(() => ({ isGenerating: false })),
  },
}));
jest.mock('../../../src/services/imageGenerationService', () => ({
  imageGenerationService: {
    generateImage: jest.fn(),
    cancelGeneration: jest.fn(),
  },
}));
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    getLoadedModelPath: jest.fn(),
    isModelLoaded: jest.fn(),
    stopGeneration: jest.fn(),
    getContextDebugInfo: jest.fn(),
    clearKVCache: jest.fn(),
  },
}));
jest.mock('../../../src/services/localDreamGenerator', () => ({
  localDreamGeneratorService: { deleteGeneratedImage: jest.fn() },
}));

jest.mock('../../../src/stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({ conversations: [] }),
  },
}));

jest.mock('../../../src/stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({ getProject: jest.fn(() => null) }),
  },
}));

jest.mock('../../../src/components', () => ({
  showAlert: jest.fn((title: string, message?: string, buttons?: any[]) => ({
    visible: true, title, message, buttons: buttons || [],
  })),
  hideAlert: jest.fn(() => ({ visible: false, title: '', message: '', buttons: [] })),
}));

jest.mock('../../../src/constants', () => ({
  APP_CONFIG: { defaultSystemPrompt: 'You are a helpful assistant.' },
}));

const mockSetHasSeenCacheTypeNudge = jest.fn();

jest.mock('../../../src/stores/appStore', () => ({
  useAppStore: {
    getState: jest.fn(),
    setState: jest.fn(),
    subscribe: jest.fn(),
  },
}));

const { useAppStore } = require('../../../src/stores/appStore');
const { generationService } = require('../../../src/services/generationService');
const { llmService } = require('../../../src/services/llm');
const { showAlert } = require('../../../src/components');

const mockGenerateResponse = generationService.generateResponse as jest.Mock;
const mockGenerateWithTools = generationService.generateWithTools as jest.Mock;
const mockGetLoadedModelPath = llmService.getLoadedModelPath as jest.Mock;
const mockIsModelLoaded = llmService.isModelLoaded as jest.Mock;
const mockGetContextDebugInfo = llmService.getContextDebugInfo as jest.Mock;
const mockClearKVCache = llmService.clearKVCache as jest.Mock;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeRef<T>(value: T): React.MutableRefObject<T> {
  return { current: value } as React.MutableRefObject<T>;
}

const baseModel = createDownloadedModel({ id: 'model-1', filePath: '/path/model.gguf' });

function makeDeps(overrides: Record<string, unknown> = {}): any {
  return {
    activeModelId: 'model-1',
    activeModel: baseModel,
    activeConversationId: 'conv-1',
    activeConversation: { id: 'conv-1', messages: [] },
    activeProject: null,
    activeImageModel: null,
    imageModelLoaded: false,
    isStreaming: false,
    isGeneratingImage: false,
    imageGenState: { isGenerating: false, progress: null, status: null, previewPath: null, prompt: null, conversationId: null, error: null, result: null },
    settings: {
      showGenerationDetails: false,
      imageGenerationMode: 'auto',
      autoDetectMethod: 'simple',
      classifierModelId: null,
      modelLoadingStrategy: 'performance' as const,
      systemPrompt: 'Be helpful',
      imageSteps: 8,
      imageGuidanceScale: 2,
      cacheType: 'q8_0',
    },
    downloadedModels: [baseModel],
    setAlertState: jest.fn(),
    setIsClassifying: jest.fn(),
    setAppImageGenerationStatus: jest.fn(),
    setAppIsGeneratingImage: jest.fn(),
    addMessage: jest.fn(),
    clearStreamingMessage: jest.fn(),
    deleteConversation: jest.fn(),
    setActiveConversation: jest.fn(),
    removeImagesByConversationId: jest.fn(() => []),
    generatingForConversationRef: makeRef<string | null>(null),
    navigation: { goBack: jest.fn(), navigate: jest.fn() },
    ensureModelLoaded: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerateResponse.mockResolvedValue(undefined);
  mockGenerateWithTools.mockResolvedValue(undefined);
  mockGetLoadedModelPath.mockReturnValue('/path/model.gguf');
  mockIsModelLoaded.mockReturnValue(true);
  mockGetContextDebugInfo.mockResolvedValue({ truncatedCount: 0, contextUsagePercent: 0 });
  mockClearKVCache.mockResolvedValue(undefined);

  (useAppStore.getState as jest.Mock).mockReturnValue({
    hasSeenCacheTypeNudge: false,
    setHasSeenCacheTypeNudge: mockSetHasSeenCacheTypeNudge,
  });
});

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('cache type nudge after generation', () => {
  it('shows nudge after first successful generation when cacheType is q8_0', async () => {
    const deps = makeDeps();
    await startGenerationFn(deps, { setDebugInfo: jest.fn(), targetConversationId: 'conv-1', messageText: 'Hello' });

    expect(deps.setAlertState).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Improve Output Quality', visible: true }),
    );
    expect(mockSetHasSeenCacheTypeNudge).toHaveBeenCalledWith(true);
  });

  it('does NOT show nudge when hasSeenCacheTypeNudge is already true', async () => {
    (useAppStore.getState as jest.Mock).mockReturnValue({
      hasSeenCacheTypeNudge: true,
      setHasSeenCacheTypeNudge: mockSetHasSeenCacheTypeNudge,
    });

    const deps = makeDeps();
    await startGenerationFn(deps, { setDebugInfo: jest.fn(), targetConversationId: 'conv-1', messageText: 'Hello' });

    expect(mockSetHasSeenCacheTypeNudge).not.toHaveBeenCalled();
    // setAlertState should NOT be called (no error either since generation succeeds)
    expect(deps.setAlertState).not.toHaveBeenCalled();
  });

  it('does NOT show nudge when cacheType is f16', async () => {
    const deps = makeDeps({ settings: { ...makeDeps().settings, cacheType: 'f16' } });
    await startGenerationFn(deps, { setDebugInfo: jest.fn(), targetConversationId: 'conv-1', messageText: 'Hello' });

    expect(mockSetHasSeenCacheTypeNudge).not.toHaveBeenCalled();
    expect(deps.setAlertState).not.toHaveBeenCalled();
  });

  it('does NOT show nudge when generation throws an error', async () => {
    mockGenerateResponse.mockRejectedValue(new Error('Model error'));

    const deps = makeDeps();
    await startGenerationFn(deps, { setDebugInfo: jest.fn(), targetConversationId: 'conv-1', messageText: 'Hello' });

    // Should show error alert, not nudge
    expect(deps.setAlertState).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Generation Error' }),
    );
    expect(mockSetHasSeenCacheTypeNudge).not.toHaveBeenCalled();
  });

  it('"Go to Settings" button navigates to ModelSettings', async () => {
    const deps = makeDeps();
    await startGenerationFn(deps, { setDebugInfo: jest.fn(), targetConversationId: 'conv-1', messageText: 'Hello' });

    const alertCall = (showAlert as jest.Mock).mock.calls.find(
      (args: any[]) => args[0] === 'Improve Output Quality',
    );
    expect(alertCall).toBeDefined();
    const buttons = alertCall![2];
    const goToSettings = buttons.find((b: any) => b.text === 'Go to Settings');
    expect(goToSettings).toBeDefined();

    goToSettings.onPress();
    expect(deps.navigation.navigate).toHaveBeenCalledWith('ModelSettings');
  });

  it('"Got it" button is present with cancel style', async () => {
    const deps = makeDeps();
    await startGenerationFn(deps, { setDebugInfo: jest.fn(), targetConversationId: 'conv-1', messageText: 'Hello' });

    const alertCall = (showAlert as jest.Mock).mock.calls.find(
      (args: any[]) => args[0] === 'Improve Output Quality',
    );
    const buttons = alertCall![2];
    const gotIt = buttons.find((b: any) => b.text === 'Got it');
    expect(gotIt).toBeDefined();
    expect(gotIt.style).toBe('cancel');
  });
});
