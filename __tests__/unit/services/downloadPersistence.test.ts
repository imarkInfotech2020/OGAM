import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistInflightDownloads, loadInflightDownloads } from '../../../src/services/downloadPersistence';
import { DownloadEntry } from '../../../src/stores/downloadStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const KEY = '@local_llm/inflight_downloads';

function makeEntry(overrides: Partial<DownloadEntry> = {}): DownloadEntry {
  return {
    modelKey: 'llm:test-model',
    downloadId: 'dl-1',
    modelType: 'text',
    status: 'running',
    fileName: 'model.gguf',
    ...overrides,
  } as DownloadEntry;
}

describe('downloadPersistence', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('persistInflightDownloads', () => {
    it('removes key when no inflight entries exist', async () => {
      const completed = makeEntry({ status: 'completed' });
      const cancelled = makeEntry({ modelKey: 'llm:m2', downloadId: 'dl-2', status: 'cancelled' });
      await persistInflightDownloads({ 'llm:test-model': completed, 'llm:m2': cancelled });
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(KEY);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('persists running entries and excludes completed/cancelled', async () => {
      const running = makeEntry({ status: 'running' });
      const completed = makeEntry({ modelKey: 'llm:m2', downloadId: 'dl-2', status: 'completed' });
      await persistInflightDownloads({ 'llm:test-model': running, 'llm:m2': completed });
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEY, expect.stringContaining('"llm:test-model"'));
      const saved = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(saved['llm:m2']).toBeUndefined();
    });

    it('persists pending entries', async () => {
      const pending = makeEntry({ status: 'pending' });
      await persistInflightDownloads({ 'llm:test-model': pending });
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('persists failed entries', async () => {
      const failed = makeEntry({ status: 'failed' });
      await persistInflightDownloads({ 'llm:test-model': failed });
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('removes key when downloads map is empty', async () => {
      await persistInflightDownloads({});
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(KEY);
    });
  });

  describe('loadInflightDownloads', () => {
    it('returns empty array when nothing stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
      const result = await loadInflightDownloads();
      expect(result).toEqual([]);
    });

    it('returns stored entries as array', async () => {
      const entry = makeEntry();
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ 'llm:test-model': entry }),
      );
      const result = await loadInflightDownloads();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ modelKey: 'llm:test-model' });
    });

    it('returns empty array on parse error', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('not-json{{{');
      const result = await loadInflightDownloads();
      expect(result).toEqual([]);
    });

    it('returns empty array when AsyncStorage throws', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage error'));
      const result = await loadInflightDownloads();
      expect(result).toEqual([]);
    });
  });
});
