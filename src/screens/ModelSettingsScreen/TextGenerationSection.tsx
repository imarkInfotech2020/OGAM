import React, { useState } from 'react';
import { View, Text, Switch } from 'react-native';
import { AdvancedToggle, Card } from '../../components';
import { NumericStepper } from '../../components/NumericStepper';
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
        </View>
        <Text style={styles.sliderDesc}>Higher = more creative, Lower = more focused</Text>
        <NumericStepper
          value={temperature}
          min={0} max={2} step={0.05} decimals={2}
          onChange={(value) => updateSettings({ liteRTTemperature: value })}
        />
      </View>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Max Tokens</Text>
        </View>
        <Text style={styles.sliderDesc}>Total token budget — input, history, and output combined (requires reload)</Text>
        {maxTokens > contextWarnThreshold && (
          <Text style={styles.warningText}>
            High context uses significant RAM — may slow or crash on some devices
          </Text>
        )}
        <NumericStepper
          value={maxTokens}
          min={512} max={contextMax} step={1024}
          formatValue={formatContext}
          onChange={(value) => updateSettings({ liteRTMaxTokens: value })}
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
        </View>
        <Text style={styles.sliderDesc}>Higher = more creative, Lower = more focused</Text>
        <NumericStepper
          value={settings?.temperature ?? 0.7}
          min={0} max={2} step={0.05} decimals={2}
          onChange={(value) => updateSettings({ temperature: value })}
        />
      </View>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Max Tokens</Text>
        </View>
        <Text style={styles.sliderDesc}>Maximum response length</Text>
        <NumericStepper
          value={maxTokens}
          min={64} max={8192} step={64}
          formatValue={() => maxTokensLabel}
          onChange={(value) => updateSettings({ maxTokens: value })}
        />
      </View>

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Context Length</Text>
        </View>
        <Text style={styles.sliderDesc}>KV cache size — larger uses more RAM (requires reload)</Text>
        {contextLength > 8192 && (
          <Text style={[styles.sliderDesc, { color: colors.error }]}>
            High context uses significant RAM and may crash on some devices
          </Text>
        )}
        <NumericStepper
          value={contextLength}
          min={512} max={llmSliderMax} step={1024}
          formatValue={() => contextLengthLabel}
          onChange={(value) => updateSettings({ contextLength: value })}
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
