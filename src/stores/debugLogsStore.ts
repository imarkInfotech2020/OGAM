import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@debug_logs';

export interface DebugLogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error';
  message: string;
}

interface DebugLogsState {
  logs: DebugLogEntry[];
  loaded: boolean;
  clearLogs: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useDebugLogsStore = create<DebugLogsState>((set, get) => ({
  logs: [],
  loaded: false,
  clearLogs: () => {
    set({ logs: [] });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },
  loadFromStorage: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const logs: DebugLogEntry[] = JSON.parse(raw);
        set({ logs, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },
}));
