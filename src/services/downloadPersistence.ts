import AsyncStorage from '@react-native-async-storage/async-storage';
import { DownloadEntry } from '../stores/downloadStore';
import { ModelKey } from '../utils/modelKey';

const INFLIGHT_DOWNLOADS_KEY = '@local_llm/inflight_downloads';

export async function persistInflightDownloads(
  downloads: Record<ModelKey, DownloadEntry>,
): Promise<void> {
  const inflight: Record<string, DownloadEntry> = {};
  for (const entry of Object.values(downloads)) {
    if (entry.status !== 'completed' && entry.status !== 'cancelled') {
      inflight[entry.modelKey] = entry;
    }
  }
  if (Object.keys(inflight).length === 0) {
    await AsyncStorage.removeItem(INFLIGHT_DOWNLOADS_KEY);
  } else {
    await AsyncStorage.setItem(INFLIGHT_DOWNLOADS_KEY, JSON.stringify(inflight));
  }
}

export async function loadInflightDownloads(): Promise<DownloadEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(INFLIGHT_DOWNLOADS_KEY);
    if (!stored) return [];
    const map = JSON.parse(stored) as Record<string, DownloadEntry>;
    return Object.values(map);
  } catch {
    return [];
  }
}
