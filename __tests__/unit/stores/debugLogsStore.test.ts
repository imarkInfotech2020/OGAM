jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDebugLogsStore } from '../../../src/stores/debugLogsStore';

const mockedGetItem = AsyncStorage.getItem as jest.Mock;
const mockedRemoveItem = AsyncStorage.removeItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useDebugLogsStore.setState({ logs: [], loaded: false } as any);
});

describe('debugLogsStore', () => {
  describe('loadFromStorage', () => {
    it('loads logs from AsyncStorage when raw data exists', async () => {
      const stored = [{ timestamp: 1000, level: 'log', message: 'hello' }];
      mockedGetItem.mockResolvedValueOnce(JSON.stringify(stored));

      await useDebugLogsStore.getState().loadFromStorage();

      expect(useDebugLogsStore.getState().logs).toHaveLength(1);
      expect(useDebugLogsStore.getState().logs[0].message).toBe('hello');
      expect(useDebugLogsStore.getState().loaded).toBe(true);
    });

    it('sets loaded=true and keeps empty logs when AsyncStorage has no data', async () => {
      mockedGetItem.mockResolvedValueOnce(null);

      await useDebugLogsStore.getState().loadFromStorage();

      expect(useDebugLogsStore.getState().logs).toHaveLength(0);
      expect(useDebugLogsStore.getState().loaded).toBe(true);
    });

    it('skips the read when already loaded', async () => {
      useDebugLogsStore.setState({ loaded: true } as any);

      await useDebugLogsStore.getState().loadFromStorage();

      expect(mockedGetItem).not.toHaveBeenCalled();
    });

    it('sets loaded=true and keeps empty logs when AsyncStorage throws', async () => {
      mockedGetItem.mockRejectedValueOnce(new Error('storage error'));

      await useDebugLogsStore.getState().loadFromStorage();

      expect(useDebugLogsStore.getState().loaded).toBe(true);
      expect(useDebugLogsStore.getState().logs).toHaveLength(0);
    });
  });

  describe('clearLogs', () => {
    it('empties the logs array and calls AsyncStorage.removeItem', () => {
      useDebugLogsStore.setState({ logs: [{ timestamp: 1, level: 'log', message: 'x' }] } as any);

      useDebugLogsStore.getState().clearLogs();

      expect(useDebugLogsStore.getState().logs).toHaveLength(0);
      expect(mockedRemoveItem).toHaveBeenCalled();
    });
  });
});
