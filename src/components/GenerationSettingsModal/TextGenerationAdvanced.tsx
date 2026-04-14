import React, { useEffect, useState } from 'react';
import { Platform, View, Text, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore } from '../../stores';
import { CacheType, InferenceBackend, INFERENCE_BACKENDS } from '../../types';
import {
  useTextGenerationAdvanced,
  CACHE_TYPE_DESCRIPTIONS,
  GPU_LAYERS_MAX,
  CACHE_TYPE_OPTIONS,
} from '../../hooks/useTextGenerationAdvanced';
import { hardwareService } from '../../services/hardware';
import { createStyles } from './styles';

const isAndroid = Platform.OS === 'android';

// ─── Inference Backend ────────────────────────────────────────────────────────

type BackendOption = { id: InferenceBackend; label: string; desc: string };

const IOS_BACKENDS: BackendOption[] = [
  { id: INFERENCE_BACKENDS.CPU, label: 'CPU', desc: 'Always available. Stable, predictable performance.' },
  { id: INFERENCE_BACKENDS.METAL, label: 'Metal', desc: 'Offload layers to GPU via Metal. Faster for larger models. Requires model reload.' },
];

const ANDROID_BASE_BACKENDS: BackendOption[] = [
  { id: INFERENCE_BACKENDS.CPU, label: 'CPU', desc: 'Always available. Stable, predictable performance.' },
  { id: INFERENCE_BACKENDS.OPENCL, label: 'OpenCL', desc: 'Offload layers to GPU via OpenCL. Fast decode on Adreno/Mali GPUs. Requires model reload.' },
];

const HTP_BACKEND: BackendOption = {
  id: INFERENCE_BACKENDS.HTP, label: 'HTP', desc: 'Offload layers to Hexagon NPU on Snapdragon devices. Best for large models. Requires model reload.',
};

export const BackendSelector: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const { gpuLayersEffective } = useTextGenerationAdvanced();
  const [hasNPU, setHasNPU] = useState(false);

  useEffect(() => {
    if (isAndroid) {
      hardwareService.getSoCInfo().then(info => setHasNPU(info.hasNPU));
    }
  }, []);

  const backends: BackendOption[] = Platform.OS === 'ios'
    ? IOS_BACKENDS
    : hasNPU ? [...ANDROID_BASE_BACKENDS, HTP_BACKEND] : ANDROID_BASE_BACKENDS;

  const defaultBackend = Platform.OS === 'ios' ? INFERENCE_BACKENDS.METAL : INFERENCE_BACKENDS.CPU;
  const current = settings.inferenceBackend ?? defaultBackend;
  const showLayers = current !== INFERENCE_BACKENDS.CPU;
  const layersLabel = current === INFERENCE_BACKENDS.HTP ? 'NPU Layers' : current === INFERENCE_BACKENDS.METAL ? 'GPU Layers (Metal)' : 'GPU Layers (OpenCL)';

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.modeToggleInfo}>
        <Text style={styles.modeToggleLabel}>Inference Backend</Text>
        <Text style={styles.modeToggleDesc}>
          {backends.find(b => b.id === current)?.desc ?? ''}
        </Text>
      </View>
      <View style={styles.modeToggleButtons}>
        {backends.map(b => (
          <TouchableOpacity
            key={b.id}
            testID={`backend-${b.id}-button`}
            style={[styles.modeButton, current === b.id && styles.modeButtonActive]}
            onPress={() => updateSettings({ inferenceBackend: b.id })}
          >
            <Text style={[styles.modeButtonText, current === b.id && styles.modeButtonTextActive]}>
              {b.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {showLayers && (
        <View style={styles.gpuLayersInline}>
          <View style={styles.settingHeader}>
            <Text style={styles.settingLabel}>{layersLabel}</Text>
            <Text style={styles.settingValue}>{gpuLayersEffective}</Text>
          </View>
          <Slider
            testID="gpu-layers-slider"
            style={styles.slider}
            minimumValue={1}
            maximumValue={GPU_LAYERS_MAX}
            step={1}
            value={gpuLayersEffective}
            onSlidingComplete={(value: number) => updateSettings({ gpuLayers: value })}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.surfaceLight}
            thumbTintColor={colors.primary}
          />
        </View>
      )}
    </View>
  );
};

// ─── Flash Attention ──────────────────────────────────────────────────────────

export const FlashAttentionToggle: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { updateSettings } = useAppStore();
  const { isFlashAttnOn, handleFlashAttnToggle } = useTextGenerationAdvanced();

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.modeToggleInfo}>
        <Text style={styles.modeToggleLabel}>Flash Attention</Text>
        <Text style={styles.modeToggleDesc}>
          Faster inference and lower memory. Required for quantized KV cache (q8_0/q4_0). Requires model reload.
        </Text>
      </View>
      <View style={styles.modeToggleButtons}>
        <TouchableOpacity
          testID="flash-attn-off-button"
          style={[styles.modeButton, !isFlashAttnOn && styles.modeButtonActive]}
          onPress={() => handleFlashAttnToggle(false)}
        >
          <Text style={[styles.modeButtonText, !isFlashAttnOn && styles.modeButtonTextActive]}>
            Off
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="flash-attn-on-button"
          style={[styles.modeButton, isFlashAttnOn && styles.modeButtonActive]}
          onPress={() => updateSettings({ flashAttn: true })}
        >
          <Text style={[styles.modeButtonText, isFlashAttnOn && styles.modeButtonTextActive]}>
            On
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── KV Cache Type ───────────────────────────────────────────────────────────

export const KvCacheTypeToggle: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { isFlashAttnOn, cacheDisabled, displayCacheType, handleCacheTypeChange } = useTextGenerationAdvanced();

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.modeToggleInfo}>
        <Text style={styles.modeToggleLabel}>KV Cache Type</Text>
        <Text style={styles.modeToggleDesc}>{CACHE_TYPE_DESCRIPTIONS[displayCacheType]}</Text>
      </View>
      <View style={styles.modeToggleButtons}>
        {CACHE_TYPE_OPTIONS.map((ct: CacheType) => (
          <TouchableOpacity
            key={ct}
            testID={`cache-type-${ct}-button`}
            style={[styles.modeButton, displayCacheType === ct && styles.modeButtonActive]}
            onPress={() => handleCacheTypeChange(ct)}
            disabled={cacheDisabled && ct !== 'f16'}
          >
            <Text style={[styles.modeButtonText, displayCacheType === ct && styles.modeButtonTextActive]}>
              {ct}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {!isFlashAttnOn && (
        <Text style={styles.settingWarning}>
          Quantized cache (q8_0/q4_0) will auto-enable flash attention.
        </Text>
      )}
    </View>
  );
};

// ─── Model Loading Strategy ───────────────────────────────────────────────────

export const ModelLoadingStrategyToggle: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const isPerformance = settings.modelLoadingStrategy === 'performance';
  const isMemory = settings.modelLoadingStrategy === 'memory';

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.modeToggleInfo}>
        <Text style={styles.modeToggleLabel}>Model Loading Strategy</Text>
        <Text style={styles.modeToggleDesc}>
          {isPerformance
            ? 'Keep models loaded for faster responses (uses more memory)'
            : 'Load models on demand to save memory (slower switching)'}
        </Text>
      </View>
      <View style={styles.modeToggleButtons}>
        <TouchableOpacity
          style={[styles.modeButton, isMemory && styles.modeButtonActive]}
          onPress={() => updateSettings({ modelLoadingStrategy: 'memory' })}
        >
          <Text style={[styles.modeButtonText, isMemory && styles.modeButtonTextActive]}>
            Save Memory
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, isPerformance && styles.modeButtonActive]}
          onPress={() => updateSettings({ modelLoadingStrategy: 'performance' })}
        >
          <Text style={[styles.modeButtonText, isPerformance && styles.modeButtonTextActive]}>
            Fast
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── CPU Threads & Batch Size ────────────────────────────────────────────────

export const CpuThreadsSlider: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const value = settings.nThreads ?? 6;

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.settingHeader}>
        <Text style={styles.settingLabel}>CPU Threads</Text>
        <Text style={styles.settingValue}>{value}</Text>
      </View>
      <Text style={styles.settingDescription}>Parallel threads for inference</Text>
      <Slider
        style={styles.slider}
        minimumValue={1}
        maximumValue={12}
        step={1}
        value={value}
        onSlidingComplete={(v: number) => updateSettings({ nThreads: v })}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.surfaceLight}
        thumbTintColor={colors.primary}
      />
    </View>
  );
};

export const BatchSizeSlider: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const value = settings.nBatch ?? 512;

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.settingHeader}>
        <Text style={styles.settingLabel}>Batch Size</Text>
        <Text style={styles.settingValue}>{value}</Text>
      </View>
      <Text style={styles.settingDescription}>Tokens processed per batch</Text>
      <Slider
        style={styles.slider}
        minimumValue={32}
        maximumValue={512}
        step={32}
        value={value}
        onSlidingComplete={(v: number) => updateSettings({ nBatch: v })}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.surfaceLight}
        thumbTintColor={colors.primary}
      />
    </View>
  );
};
