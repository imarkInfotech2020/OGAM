import { create } from 'zustand';

export interface DebugLogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error';
  message: string;
}

interface DebugLogsState {
  logs: DebugLogEntry[];
  addLog: (level: 'log' | 'warn' | 'error', message: string) => void;
  clearLogs: () => void;
}

export const useDebugLogsStore = create<DebugLogsState>((set) => ({
  logs: [],
  addLog: (level, message) =>
    set((state) => ({
      // Keep last 200 logs for memory efficiency
      logs: [...state.logs, { timestamp: Date.now(), level, message }].slice(-200),
    })),
  clearLogs: () => set({ logs: [] }),
}));
