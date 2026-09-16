import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createJSONStorage,
  type PersistStorage,
  type StateStorage,
} from 'zustand/middleware';

export interface HydrationGatedStorage<S> {
  storage: PersistStorage<S>;
  markHydrated(): void;
  isHydrated(): boolean;
  waitForWrites(): Promise<void>;
}

/** Prevent boot-time defaults from replacing saved state before Zustand finishes hydration. */
export function createHydrationGatedStorage<S>(
  base: StateStorage = AsyncStorage,
  unchanged?: (previous: S, next: S) => boolean,
): HydrationGatedStorage<S> {
  let hydrated = false;
  let lastWritten: S | undefined;
  const pendingWrites = new Set<Promise<void>>();
  const json = createJSONStorage<S>(() => base);
  if (!json) throw new Error('JSON storage is unavailable');

  return {
    storage: {
      getItem: async name => {
        const value = await json.getItem(name);
        lastWritten = value?.state;
        return value;
      },
      setItem: (name, value) => {
        if (!hydrated) return undefined;
        if (
          lastWritten !== undefined &&
          unchanged?.(lastWritten, value.state)
        ) {
          return undefined;
        }
        lastWritten = value.state;
        const result = json.setItem(name, value);
        if (!result) return undefined;
        const write = Promise.resolve(result).then(() => undefined);
        pendingWrites.add(write);
        return write.finally(() => pendingWrites.delete(write));
      },
      removeItem: name => {
        if (!hydrated) return undefined;
        lastWritten = undefined;
        return json.removeItem(name);
      },
    },
    markHydrated: () => {
      hydrated = true;
    },
    isHydrated: () => hydrated,
    waitForWrites: async () => {
      while (pendingWrites.size > 0) {
        await Promise.all([...pendingWrites]);
      }
    },
  };
}
