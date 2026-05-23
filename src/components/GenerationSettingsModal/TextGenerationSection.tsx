import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { AdvancedToggle } from '../AdvancedToggle';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore, selectIsLiteRT } from '../../stores';
import { hardwareService } from '../../services';
import { createStyles } from './styles';
import {
  CpuThreadsSlider,
  BatchSizeSlider,
  BackendSelector,
  FlashAttentionToggle,
  KvCacheTypeToggle,
  ModelLoadingStrategyToggle,
} from './TextGenerationAdvanced';

interface SettingConfig {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  description?: string;
  warning?: (value: number) => string | null;
  warningColor?: string;
}

const DEFAULT_SETTINGS: Record<string, number> = {
  temperature: 0.7,
  maxTokens: 1024,
  topP: 0.9,
  repeatPenalty: 1.1,
  contextLength: 4096,
};

const formatContext = (v: number) => v >= 1024 ? `${(v / 1024).toFixed(0)}K` : v.toString();

const BASIC_KEYS = ['temperature', 'maxTokens', 'contextLength'];
const LITERT_BASIC_KEYS = ['temperature', 'contextLength'];
const LITERT_ADVANCED_KEYS = ['topP'];

const buildSettingsConfig = (modelMaxContext: number | null, isLiteRT: boolean): SettingConfig[] => {
  const isLargeRam = hardwareService.getTotalMemoryGB() > 8;
  const liteRTMax = modelMaxContext ?? (isLargeRam ? 32768 : 12288);
  const liteRTWarn = isLargeRam ? 16384 : 8192;
  const llmMax = modelMaxContext ?? 32768;

  const contextWarning = (v: number): string | null => {
    if (!isLiteRT) return v > 8192 ? 'High context uses significant RAM and may crash on some devices' : null;
    return v > liteRTWarn ? 'High context uses significant RAM — may slow or crash on some devices' : null;
  };

  return [
  {
    key: 'temperature',
    label: 'Temperature',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    description: 'Higher = more creative, Lower = more focused',
  },
  {
    key: 'maxTokens',
    label: 'Max Tokens',
    min: 64,
    max: 8192,
    step: 64,
    format: (v) => v >= 1024 ? `${(v / 1024).toFixed(1)}K` : v.toString(),
    description: 'Maximum length of generated response',
  },
  {
    key: 'topP',
    label: 'Top P',
    min: 0.1,
    max: 1.0,
    step: 0.05,
    format: (v) => v.toFixed(2),
    description: 'Nucleus sampling threshold',
  },
  {
    key: 'repeatPenalty',
    label: 'Repeat Penalty',
    min: 1.0,
    max: 2.0,
    step: 0.05,
    format: (v) => v.toFixed(2),
    description: 'Penalize repeated tokens',
  },
  {
    key: 'contextLength',
    label: isLiteRT ? 'Max Tokens' : 'Context Length',
    min: 512,
    max: isLiteRT ? liteRTMax : llmMax,
    step: 1024,
    format: formatContext,
    description: isLiteRT
      ? 'Total context window — input + history + output combined (requires reload)'
      : 'KV cache size — larger uses more RAM (requires reload)',
    warning: contextWarning,
    warningColor: isLiteRT ? '#F59E0B' : undefined,
  },
  ];
};

interface SettingSliderProps {
  config: SettingConfig;
}

const SettingSlider: React.FC<SettingSliderProps> = ({ config }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const rawValue = (settings as Record<string, unknown>)[config.key];
  const value = (rawValue ?? DEFAULT_SETTINGS[config.key]) as number;
  const warningText = config.warning?.(value) ?? null;
  const warningColor = config.warningColor ?? colors.error;

  return (
    <View style={styles.settingGroup}>
      <View style={styles.settingHeader}>
        <Text style={styles.settingLabel}>{config.label}</Text>
        <Text style={styles.settingValue}>{config.format(value)}</Text>
      </View>
      {config.description && (
        <Text style={styles.settingDescription}>{config.description}</Text>
      )}
      {warningText && (
        <Text style={[styles.settingDescription, { color: warningColor }]}>{warningText}</Text>
      )}
      <Slider
        style={styles.slider}
        minimumValue={config.min}
        maximumValue={config.max}
        step={config.step}
        value={value}
        onValueChange={(v) => updateSettings({ [config.key]: v })}
        onSlidingComplete={() => {}}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.surfaceLight}
        thumbTintColor={colors.primary}
      />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderMinMax}>{config.format(config.min)}</Text>
        <Text style={styles.sliderMinMax}>{config.format(config.max)}</Text>
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

export const TextGenerationSection: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const modelMaxContext = useAppStore((s) => s.modelMaxContext);
  const isLiteRT = useAppStore(selectIsLiteRT);
  const settingsConfig = buildSettingsConfig(modelMaxContext, isLiteRT);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const basicKeys = isLiteRT ? LITERT_BASIC_KEYS : BASIC_KEYS;
  const advancedKeys = isLiteRT ? LITERT_ADVANCED_KEYS : settingsConfig.filter(c => !BASIC_KEYS.includes(c.key)).map(c => c.key);

  const basicSettings = settingsConfig.filter(c => basicKeys.includes(c.key));
  const advancedSettings = settingsConfig.filter(c => advancedKeys.includes(c.key));

  return (
    <View style={styles.sectionCard}>
      {basicSettings.map((config) => (
        <SettingSlider key={config.key} config={config} />
      ))}
      <ShowGenerationDetailsToggle />

      <AdvancedToggle isExpanded={showAdvanced} onPress={() => setShowAdvanced(!showAdvanced)} testID="modal-text-advanced-toggle" />

      {showAdvanced && (
        <>
          {advancedSettings.map((config) => (
            <SettingSlider key={config.key} config={config} />
          ))}
          {!isLiteRT && <CpuThreadsSlider />}
          {!isLiteRT && <BatchSizeSlider />}
          <BackendSelector hideGpuLayers={isLiteRT} />
          {!isLiteRT && <FlashAttentionToggle />}
          {!isLiteRT && <KvCacheTypeToggle />}
          {!isLiteRT && <ModelLoadingStrategyToggle />}
        </>
      )}
    </View>
  );
};
