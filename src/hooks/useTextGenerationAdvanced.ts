import { Platform } from 'react-native';
import { useAppStore } from '../stores';
import { CacheType } from '../types';

export const CACHE_TYPE_DESCRIPTIONS: Record<CacheType, string> = {
  f16: 'Full precision — best quality, highest memory usage',
  q8_0: '8-bit quantized — good balance of quality and memory',
  q4_0: '4-bit quantized — lowest memory, may reduce quality',
};

export const GPU_LAYERS_MAX = 99;
export const CACHE_TYPE_OPTIONS: CacheType[] = ['f16', 'q8_0', 'q4_0'];

export function useTextGenerationAdvanced() {
  const { settings, updateSettings } = useAppStore();

  const isFlashAttnOn = settings?.flashAttn ?? true;
  const isQuantizedCache = (settings?.cacheType ?? 'q8_0') !== 'f16';
  const currentCacheType: CacheType = settings?.cacheType ?? 'q8_0';
  const gpuLayersEffective = Math.min(settings?.gpuLayers ?? 1, GPU_LAYERS_MAX);
  const isGpuEnabled = (settings?.inferenceBackend ?? (Platform.OS === 'ios' ? 'metal' : 'cpu')) !== 'cpu';
  const isAndroid = Platform.OS === 'android';
  const gpuForcesF16 = false;
  // OpenCL forces f16 — disable quantized cache options in the UI
  const cacheDisabled = (settings?.inferenceBackend ?? 'cpu') === 'opencl';
  const displayCacheType = cacheDisabled ? 'f16' : currentCacheType;

  const handleFlashAttnToggle = (flashAttn: boolean) => {
    if (!flashAttn && isQuantizedCache) {
      updateSettings({ flashAttn: false, cacheType: 'f16' });
    } else {
      updateSettings({ flashAttn: flashAttn });
    }
  };

  const handleCacheTypeChange = (ct: CacheType) => {
    if (cacheDisabled) return;
    const updates: Partial<typeof settings> = { cacheType: ct };
    if (ct !== 'f16' && !isFlashAttnOn) {
      updates.flashAttn = true;
    }
    updateSettings(updates);
  };

  return {
    // State
    settings,
    updateSettings,
    isFlashAttnOn,
    isQuantizedCache,
    currentCacheType,
    displayCacheType,
    gpuLayersEffective,
    isGpuEnabled,
    isAndroid,
    gpuForcesF16,
    cacheDisabled,

    // Handlers
    handleFlashAttnToggle,
    handleCacheTypeChange,
  };
}
