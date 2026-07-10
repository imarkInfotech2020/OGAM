/**
 * generateStandalone — engine-agnostic one-shot text completion.
 *
 * Regression: the image-prompt enhancement path used to hardcode llmService, so when a
 * LiteRT text model was active, llmService.isModelLoaded()/generateResponse never saw it —
 * enhancement was skipped even though the model was resident. generateStandalone dispatches
 * to the ACTIVE engine (resolved from the store), so a LiteRT model runs its own one-shot
 * (prepareConversation + generateRaw on a throwaway session) and llama runs generateResponse.
 */
import { generateStandalone } from '../../../src/services/engines';
import { llmService } from '../../../src/services/llm';
import { liteRTService } from '../../../src/services/litert';
import { useAppStore } from '../../../src/stores';
import type { Message } from '../../../src/types';

jest.mock('../../../src/services/llm', () => ({
  llmService: { isModelLoaded: jest.fn(), generateResponse: jest.fn() },
}));
jest.mock('../../../src/services/litert', () => ({
  liteRTService: {
    isModelLoaded: jest.fn(),
    prepareConversation: jest.fn(() => Promise.resolve()),
    generateRaw: jest.fn(),
    invalidateConversation: jest.fn(),
  },
}));

const mockLlm = llmService as jest.Mocked<typeof llmService>;
const mockLiteRT = liteRTService as jest.Mocked<typeof liteRTService>;

const setActive = (engine: 'llama' | 'litert') => {
  useAppStore.setState({
    downloadedModels: [{ id: 'm1', engine } as any],
    activeModelId: 'm1',
    settings: { ...useAppStore.getState().settings, liteRTTemperature: 0.7, liteRTTopP: 0.9 } as any,
  });
};

const MESSAGES: Message[] = [
  { id: 's', role: 'system', content: 'You enhance prompts.' } as Message,
  { id: 'u', role: 'user', content: 'a dog' } as Message,
];

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ downloadedModels: [], activeModelId: null } as any);
});

describe('generateStandalone — dispatches to the active engine', () => {
  it('LiteRT active: runs the LiteRT one-shot (prepareConversation + generateRaw), NOT llama', async () => {
    setActive('litert');
    mockLiteRT.generateRaw.mockResolvedValue('an enhanced dog prompt');

    const out = await generateStandalone(MESSAGES);

    expect(out).toBe('an enhanced dog prompt');
    // The system prompt seeds a throwaway session; the user text is the one-shot input.
    expect(mockLiteRT.prepareConversation).toHaveBeenCalledWith(
      '__standalone__',
      'You enhance prompts.',
      expect.objectContaining({ history: [] }),
    );
    expect(mockLiteRT.generateRaw).toHaveBeenCalledWith('a dog');
    expect(mockLiteRT.invalidateConversation).toHaveBeenCalled(); // throwaway session cleaned up
    // The old bug: llama was used for everything. It must NOT be touched for a LiteRT model.
    expect(mockLlm.generateResponse).not.toHaveBeenCalled();
  });

  it('LiteRT active: cleans up the throwaway session even when generation throws', async () => {
    setActive('litert');
    mockLiteRT.generateRaw.mockRejectedValue(new Error('native fail'));
    await expect(generateStandalone(MESSAGES)).rejects.toThrow('native fail');
    expect(mockLiteRT.invalidateConversation).toHaveBeenCalled();
  });

  it('llama active: runs llmService.generateResponse with the full message list, NOT LiteRT', async () => {
    setActive('llama');
    mockLlm.generateResponse.mockResolvedValue('a llama-enhanced dog');

    const out = await generateStandalone(MESSAGES);

    expect(out).toBe('a llama-enhanced dog');
    expect(mockLlm.generateResponse).toHaveBeenCalledWith(MESSAGES, expect.any(Function));
    expect(mockLiteRT.generateRaw).not.toHaveBeenCalled();
  });
});
