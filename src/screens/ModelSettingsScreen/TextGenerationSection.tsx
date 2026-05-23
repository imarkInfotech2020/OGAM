import React, { useState } from 'react';
import { View, Text, Switch } from 'react-native';
import Slider from '@react-native-community/slider';
import { AdvancedToggle, Card } from '../../components';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore, selectIsLiteRT } from '../../stores';
import { hardwareService } from '../../services';
import { createStyles } from './styles';
import { TextGenerationAdvanced, LiteRTTextGenerationAdvanced } from './TextGenerationAdvanced';

const formatContext = (v: number) => v >= 1024 ? `${(v / 1024).toFixed(0)}K` : String(v);

// ─── Shared ───────────────────────────────────────────────────────────────────

const ShowGenerationDetailsToggle: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const trackColor = { false: colors.surfaceLight, true: `${colors.primary}80` };

  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>Show Generation Details</Text>
        <Text style={styles.toggleDesc}>
          Display tokens/sec, timing, and memory usage on responses
        </Text>
      </View>
      <Switch
        value={settings?.showGenerationDetails ?? false}
        onValueChange={(value) => updateSettings({ showGenerationDetails: value })}
        trackColor={trackColor}
        thumbColor={settings?.showGenerationDetails ? colors.primary : colors.textMuted}
      />
    </View>
  );
};

// ─── LiteRT Settings ─────────────────────────────────────────────────────────

const LiteRTTextSettings: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const modelMaxContext = useAppStore((s) => s.modelMaxContext);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isLargeRam = hardwareService.getTotalMemoryGB() > 8;
  const contextMax = modelMaxContext ?? (isLargeRam ? 32768 : 12288);
  const contextWarnThreshold = isLargeRam ? 16384 : 8192;

  const temperature = settings?.liteRTTemperature ?? 0.7;
  const maxTokens = settings?.liteRTMaxTokens ?? 4096;

  return (
    <Card style={styles.section}>
      <Text style={styles.settingHelp}>Configure LiteRT model behavior.</Text>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Temperature</Text>
          <Text style={styles.sliderValue}>{temperature.toFixed(2)}</Text>
        </View>
        <Text style={styles.sliderDesc}>Higher = more creative, Lower = more focused</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={2}
          step={0.05}
          value={temperature}
          onSlidingComplete={(value) => updateSettings({ liteRTTemperature: value })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface}
          thumbTintColor={colors.primary}
        />
      </View>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Max Tokens</Text>
          <Text style={styles.sliderValue}>{formatContext(maxTokens)}</Text>
        </View>
        <Text style={styles.sliderDesc}>Total token budget — input, history, and output combined (requires reload)</Text>
        {maxTokens > contextWarnThreshold && (
          <Text style={styles.warningText}>
            High context uses significant RAM — may slow or crash on some devices
          </Text>
        )}
        <Slider
          style={styles.slider}
          minimumValue={512}
          maximumValue={contextMax}
          step={1024}
          value={maxTokens}
          onSlidingComplete={(value) => updateSettings({ liteRTMaxTokens: value })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface}
          thumbTintColor={colors.primary}
        />
      </View>

      <ShowGenerationDetailsToggle />

      <AdvancedToggle isExpanded={showAdvanced} onPress={() => setShowAdvanced(!showAdvanced)} testID="text-advanced-toggle" />
      {showAdvanced && <LiteRTTextGenerationAdvanced />}
    </Card>
  );
};

// ─── Llama Settings ───────────────────────────────────────────────────────────

const LlamaTextSettings: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const modelMaxContext = useAppStore((s) => s.modelMaxContext);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const llmSliderMax = modelMaxContext ?? 32768;

  const maxTokens = settings?.maxTokens ?? 512;
  const contextLength = settings?.contextLength ?? 2048;

  const maxTokensLabel = maxTokens >= 1024
    ? `${(maxTokens / 1024).toFixed(1)}K`
    : String(maxTokens);
  const contextLengthLabel = formatContext(contextLength);

  return (
    <Card style={styles.section}>
      <Text style={styles.settingHelp}>Configure LLM behavior for text responses.</Text>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Temperature</Text>
          <Text style={styles.sliderValue}>{(settings?.temperature ?? 0.7).toFixed(2)}</Text>
        </View>
        <Text style={styles.sliderDesc}>Higher = more creative, Lower = more focused</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={2}
          step={0.05}
          value={settings?.temperature ?? 0.7}
          onSlidingComplete={(value) => updateSettings({ temperature: value })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface}
          thumbTintColor={colors.primary}
        />
      </View>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Max Tokens</Text>
          <Text style={styles.sliderValue}>{maxTokensLabel}</Text>
        </View>
        <Text style={styles.sliderDesc}>Maximum response length</Text>
        <Slider
          style={styles.slider}
          minimumValue={64}
          maximumValue={8192}
          step={64}
          value={maxTokens}
          onSlidingComplete={(value) => updateSettings({ maxTokens: value })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface}
          thumbTintColor={colors.primary}
        />
      </View>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Context Length</Text>
          <Text style={styles.sliderValue}>{contextLengthLabel}</Text>
        </View>
        <Text style={styles.sliderDesc}>KV cache size — larger uses more RAM (requires reload)</Text>
        {contextLength > 8192 && (
          <Text style={[styles.sliderDesc, { color: colors.error }]}>
            High context uses significant RAM and may crash on some devices
          </Text>
        )}
        <Slider
          style={styles.slider}
          minimumValue={512}
          maximumValue={llmSliderMax}
          step={1024}
          value={contextLength}
          onSlidingComplete={(value) => updateSettings({ contextLength: value })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface}
          thumbTintColor={colors.primary}
        />
      </View>

      <ShowGenerationDetailsToggle />

      <AdvancedToggle isExpanded={showAdvanced} onPress={() => setShowAdvanced(!showAdvanced)} testID="text-advanced-toggle" />
      {showAdvanced && <TextGenerationAdvanced />}
    </Card>
  );
};

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export const TextGenerationSection: React.FC = () => {
  const isLiteRT = useAppStore(selectIsLiteRT);
  return isLiteRT ? <LiteRTTextSettings /> : <LlamaTextSettings />;
};
