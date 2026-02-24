import React from 'react';
import { View, Text, Switch, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { Card } from '../../components';
import { Button } from '../../components/Button';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore } from '../../stores';
import { CacheType } from '../../types';
import { createStyles } from './styles';

const CACHE_DESC: Record<CacheType, string> = {
  f16: 'Full precision — best quality, highest memory usage',
  q8_0: '8-bit quantized — good balance of quality and memory',
  q4_0: '4-bit quantized — lowest memory, may reduce quality',
};

export const PerformanceSection: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();

  const isFlashAttnOn = settings?.flashAttn ?? (Platform.OS !== 'android');
  const gpuLayersMax = Platform.OS === 'android' && isFlashAttnOn ? 1 : 99;
  const gpuLayersEffective = Math.min(settings?.gpuLayers ?? 6, gpuLayersMax);
  const trackColor = { false: colors.surfaceLight, true: `${colors.primary}80` };
  const isGpuEnabled = settings?.enableGpu !== false;

  const handleFlashAttnChange = (value: boolean) => {
    const updates: Parameters<typeof updateSettings>[0] = { flashAttn: value };
    if (value && Platform.OS === 'android' && (settings?.gpuLayers ?? 6) > 1) {
      updates.gpuLayers = 1;
    }
    updateSettings(updates);
  };

  return (
    <Card style={styles.section}>
      <Text style={styles.settingHelp}>Tune inference speed and memory usage.</Text>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>CPU Threads</Text>
          <Text style={styles.sliderValue}>{settings?.nThreads || 6}</Text>
        </View>
        <Text style={styles.sliderDesc}>Parallel threads for inference</Text>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={12}
          step={1}
          value={settings?.nThreads || 6}
          onSlidingComplete={(value) => updateSettings({ nThreads: value })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface}
          thumbTintColor={colors.primary}
        />
      </View>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Batch Size</Text>
          <Text style={styles.sliderValue}>{settings?.nBatch || 256}</Text>
        </View>
        <Text style={styles.sliderDesc}>Tokens processed per batch</Text>
        <Slider
          style={styles.slider}
          minimumValue={32}
          maximumValue={512}
          step={32}
          value={settings?.nBatch || 256}
          onSlidingComplete={(value) => updateSettings({ nBatch: value })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface}
          thumbTintColor={colors.primary}
        />
      </View>

      {Platform.OS !== 'ios' && (
        <GpuSection
          isGpuEnabled={isGpuEnabled}
          isFlashAttnOn={isFlashAttnOn}
          gpuLayersMax={gpuLayersMax}
          gpuLayersEffective={gpuLayersEffective}
          trackColor={trackColor}
        />
      )}

      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Flash Attention</Text>
          <Text style={styles.toggleDesc}>
            Faster inference and lower memory. On Android, enabling this limits GPU layers to 1. Requires model reload.
          </Text>
        </View>
        <Switch
          testID="flash-attn-switch"
          value={isFlashAttnOn}
          onValueChange={handleFlashAttnChange}
          trackColor={trackColor}
          thumbColor={isFlashAttnOn ? colors.primary : colors.textMuted}
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>KV Cache Type</Text>
          <Text style={styles.toggleDesc}>
            {CACHE_DESC[settings?.cacheType ?? 'q8_0']}
          </Text>
        </View>
      </View>
      <View style={styles.strategyButtons}>
        {(['f16', 'q8_0', 'q4_0'] as CacheType[]).map((ct) => (
          <Button
            key={ct}
            title={ct}
            variant="secondary"
            size="small"
            active={(settings?.cacheType ?? 'q8_0') === ct}
            onPress={() => updateSettings({ cacheType: ct })}
            style={styles.flex1}
          />
        ))}
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Model Loading Strategy</Text>
          <Text style={styles.toggleDesc}>
            {settings?.modelLoadingStrategy === 'performance'
              ? 'Keep models loaded for faster responses'
              : 'Load models on demand to save memory'}
          </Text>
        </View>
      </View>
      <View style={styles.strategyButtons}>
        <Button
          title="Save Memory"
          variant="secondary"
          size="small"
          testID="strategy-memory-button"
          active={settings?.modelLoadingStrategy === 'memory'}
          onPress={() => updateSettings({ modelLoadingStrategy: 'memory' })}
          style={styles.flex1}
        />
        <Button
          title="Fast"
          variant="secondary"
          size="small"
          testID="strategy-performance-button"
          active={settings?.modelLoadingStrategy === 'performance'}
          onPress={() => updateSettings({ modelLoadingStrategy: 'performance' })}
          style={styles.flex1}
        />
      </View>
    </Card>
  );
};

interface GpuSectionProps {
  isGpuEnabled: boolean;
  isFlashAttnOn: boolean;
  gpuLayersMax: number;
  gpuLayersEffective: number;
  trackColor: { false: string; true: string };
}

const GpuSection: React.FC<GpuSectionProps> = ({
  isGpuEnabled,
  isFlashAttnOn,
  gpuLayersMax,
  gpuLayersEffective,
  trackColor,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { updateSettings } = useAppStore();

  return (
    <>
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>GPU Acceleration</Text>
          <Text style={styles.toggleDesc}>
            Offload model layers to GPU. Requires model reload.
          </Text>
        </View>
        <Switch
          testID="gpu-acceleration-switch"
          value={isGpuEnabled}
          onValueChange={(value) => updateSettings({ enableGpu: value })}
          trackColor={trackColor}
          thumbColor={isGpuEnabled ? colors.primary : colors.textMuted}
        />
      </View>

      {isGpuEnabled && (
        <View style={styles.sliderSection}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>GPU Layers</Text>
            <Text style={styles.sliderValue}>{gpuLayersEffective}</Text>
          </View>
          <Text style={styles.sliderDesc}>
            Layers offloaded to GPU. Higher = faster but may crash on low-VRAM devices.
          </Text>
          <Slider
            testID="gpu-layers-slider"
            style={styles.slider}
            minimumValue={1}
            maximumValue={gpuLayersMax}
            step={1}
            value={gpuLayersEffective}
            onSlidingComplete={(value) => updateSettings({ gpuLayers: value })}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.surface}
            thumbTintColor={colors.primary}
          />
          {Platform.OS === 'android' && isFlashAttnOn && (
            <Text style={styles.warningText}>
              Flash Attention limits GPU layers to 1 on Android
            </Text>
          )}
        </View>
      )}
    </>
  );
};
