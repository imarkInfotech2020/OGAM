/**
 * TTS download provider (pro) — wraps the executorch engine under the uniform
 * contract. Verifies list maps downloaded/downloading engines, capabilities reflect
 * the executorch gaps (cancel:false, retry:false, determinateProgress:false), and
 * remove routes through the TTS store's delete.
 */
const mockEngine = {
  displayName: 'Kokoro TTS',
  checkAssetStatus: jest.fn(async () => {}),
  isFullyDownloaded: jest.fn(() => true),
  getOverallDownloadProgress: jest.fn(() => 1),
  getPhase: jest.fn(() => 'ready'),
  getRequiredAssets: jest.fn(() => [{ sizeBytes: 80_000_000 }]),
};
jest.mock('../../../pro/audio/engine', () => ({
  ttsRegistry: { getRegisteredIds: () => ['kokoro'], getEngine: () => mockEngine },
}));
const mockTts = { settings: { engineId: 'kokoro' }, setEngine: jest.fn(async () => {}), deleteModels: jest.fn(async () => {}) };
jest.mock('../../../pro/audio/ttsStore', () => ({
  useTTSStore: { getState: () => mockTts, subscribe: () => () => {} },
}));

import { ttsProvider } from '../../../pro/audio/ttsDownloadProvider';

beforeEach(() => {
  jest.clearAllMocks();
  mockEngine.isFullyDownloaded.mockReturnValue(true);
  mockEngine.getOverallDownloadProgress.mockReturnValue(1);
  mockEngine.getPhase.mockReturnValue('ready');
});

describe('ttsProvider', () => {
  it('lists a downloaded engine as completed with executorch capability gaps', async () => {
    const d = (await ttsProvider.list())[0];
    expect(d.id).toBe('tts:kokoro');
    expect(d.status).toBe('completed');
    expect(d.capabilities.cancel).toBe(false);
    expect(d.capabilities.retry).toBe(false);
    expect(d.capabilities.determinateProgress).toBe(false);
    expect(d.capabilities.resumable).toBe(true);
  });

  it('lists an in-progress download as downloading with fractional progress', async () => {
    mockEngine.isFullyDownloaded.mockReturnValue(false);
    mockEngine.getPhase.mockReturnValue('downloading');
    mockEngine.getOverallDownloadProgress.mockReturnValue(0.4);
    const d = (await ttsProvider.list())[0];
    expect(d.status).toBe('downloading');
    expect(d.progress).toBe(0.4);
    expect(d.bytesDownloaded).toBe(Math.round(80_000_000 * 0.4));
  });

  it('omits an engine that is neither downloaded nor downloading', async () => {
    mockEngine.isFullyDownloaded.mockReturnValue(false);
    mockEngine.getPhase.mockReturnValue('idle');
    mockEngine.getOverallDownloadProgress.mockReturnValue(0);
    expect(await ttsProvider.list()).toHaveLength(0);
  });

  it('remove routes through the TTS store delete', async () => {
    await ttsProvider.remove('tts:kokoro');
    expect(mockTts.deleteModels).toHaveBeenCalled();
  });
});
