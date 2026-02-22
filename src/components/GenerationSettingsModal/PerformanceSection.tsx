import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore } from '../../stores';
import { createStyles } from './styles';

// ─── GPU Acceleration ─────────────────────────────────────────────────────────

const GpuAccelerationToggle: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const isFlashAttnOn = settings.flashAttn ?? (Platform.OS !== 'android');
  const gpuLayersMax = (Platform.OS === 'android' && isFlashAttnOn) ? 1 : 99;
  const gpuLayersEffective = Math.min(settings.gpuLayers ?? 6, gpuLayersMax);

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.modeToggleInfo}>
        <Text style={styles.modeToggleLabel}>GPU Acceleration</Text>
        <Text style={styles.modeToggleDesc}>
          Offload inference to GPU when available. Faster for large models, may add overhead for small ones. Requires model reload.
        </Text>
      </View>
      <View style={styles.modeToggleButtons}>
        <TouchableOpacity
          testID="gpu-off-button"
          style={[styles.modeButton, !settings.enableGpu && styles.modeButtonActive]}
          onPress={() => updateSettings({ enableGpu: false })}
        >
          <Text style={[styles.modeButtonText, !settings.enableGpu && styles.modeButtonTextActive]}>
            Off
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="gpu-on-button"
          style={[styles.modeButton, settings.enableGpu && styles.modeButtonActive]}
          onPress={() => updateSettings({ enableGpu: true })}
        >
          <Text style={[styles.modeButtonText, settings.enableGpu && styles.modeButtonTextActive]}>
            On
          </Text>
        </TouchableOpacity>
      </View>

      {settings.enableGpu && (
        <View style={styles.gpuLayersInline}>
          <View style={styles.settingHeader}>
            <Text style={styles.settingLabel}>GPU Layers</Text>
            <Text style={styles.settingValue}>{gpuLayersEffective}</Text>
          </View>
          <Text style={styles.settingDescription}>
            Layers offloaded to GPU. Higher = faster but may crash on low-VRAM devices. Requires model reload.
          </Text>
          <Slider
            testID="gpu-layers-slider"
            style={styles.slider}
            minimumValue={1}
            maximumValue={gpuLayersMax}
            step={1}
            value={gpuLayersEffective}
            onSlidingComplete={(value: number) => updateSettings({ gpuLayers: value })}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.surfaceLight}
            thumbTintColor={colors.primary}
          />
          {Platform.OS === 'android' && isFlashAttnOn && (
            <Text style={styles.settingWarning}>
              Flash Attention limits GPU layers to 1 on Android
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

// ─── Flash Attention ──────────────────────────────────────────────────────────

const FlashAttentionToggle: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const isFlashAttnOn = settings.flashAttn ?? (Platform.OS !== 'android');

  const handleFlashAttnOn = () => {
    const updates: Parameters<typeof updateSettings>[0] = { flashAttn: true };
    if (Platform.OS === 'android' && (settings.gpuLayers ?? 6) > 1) {
      updates.gpuLayers = 1;
    }
    updateSettings(updates);
  };

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.modeToggleInfo}>
        <Text style={styles.modeToggleLabel}>Flash Attention</Text>
        <Text style={styles.modeToggleDesc}>
          Faster inference and lower memory. On Android, enabling this limits GPU layers to 1. Requires model reload.
        </Text>
      </View>
      <View style={styles.modeToggleButtons}>
        <TouchableOpacity
          testID="flash-attn-off-button"
          style={[styles.modeButton, !isFlashAttnOn && styles.modeButtonActive]}
          onPress={() => updateSettings({ flashAttn: false })}
        >
          <Text style={[styles.modeButtonText, !isFlashAttnOn && styles.modeButtonTextActive]}>
            Off
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="flash-attn-on-button"
          style={[styles.modeButton, isFlashAttnOn && styles.modeButtonActive]}
          onPress={handleFlashAttnOn}
        >
          <Text style={[styles.modeButtonText, isFlashAttnOn && styles.modeButtonTextActive]}>
            On
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Model Loading Strategy ───────────────────────────────────────────────────

const ModelLoadingStrategyToggle: React.FC = () => {
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

// ─── Show Generation Details ──────────────────────────────────────────────────

const ShowGenerationDetailsToggle: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const isOn = settings.showGenerationDetails;

  return (
    <View style={styles.modeToggleContainer}>
      <View style={styles.modeToggleInfo}>
        <Text style={styles.modeToggleLabel}>Show Generation Details</Text>
        <Text style={styles.modeToggleDesc}>
          Display GPU, model, tok/s, and image settings below each message
        </Text>
      </View>
      <View style={styles.modeToggleButtons}>
        <TouchableOpacity
          style={[styles.modeButton, !isOn && styles.modeButtonActive]}
          onPress={() => updateSettings({ showGenerationDetails: false })}
        >
          <Text style={[styles.modeButtonText, !isOn && styles.modeButtonTextActive]}>Off</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, isOn && styles.modeButtonActive]}
          onPress={() => updateSettings({ showGenerationDetails: true })}
        >
          <Text style={[styles.modeButtonText, isOn && styles.modeButtonTextActive]}>On</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Main Section ─────────────────────────────────────────────────────────────

export const PerformanceSection: React.FC = () => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.sectionCard}>
      {Platform.OS !== 'ios' && <GpuAccelerationToggle />}
      <FlashAttentionToggle />
      <ModelLoadingStrategyToggle />
      <ShowGenerationDetailsToggle />
    </View>
  );
};
