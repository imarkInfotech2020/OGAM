import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@debug_logs';
const MAX_LOGS = 2000;

export interface DebugLogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error';
  message: string;
}

interface DebugLogsState {
  logs: DebugLogEntry[];
  loaded: boolean;
  addLog: (level: 'log' | 'warn' | 'error', message: string) => void;
  clearLogs: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useDebugLogsStore = create<DebugLogsState>((set, get) => ({
  logs: [],
  loaded: false,
  addLog: (level, message) => {
    const entry: DebugLogEntry = { timestamp: Date.now(), level, message };
    set((state) => {
      const updated = [...state.logs, entry].slice(-MAX_LOGS);
      // Fire-and-forget persist — don't await so addLog stays synchronous
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return { logs: updated };
    });
  },
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
