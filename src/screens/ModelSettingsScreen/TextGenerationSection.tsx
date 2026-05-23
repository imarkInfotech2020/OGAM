import React, { useState } from 'react';
import { View, Text, Switch } from 'react-native';
import Slider from '@react-native-community/slider';
import { AdvancedToggle, Card } from '../../components';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore, selectIsLiteRT } from '../../stores';
import { hardwareService } from '../../services';
import { createStyles } from './styles';
import { TextGenerationAdvanced } from './TextGenerationAdvanced';

export const TextGenerationSection: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings } = useAppStore();
  const modelMaxContext = useAppStore((s) => s.modelMaxContext);
  const isLiteRT = useAppStore(selectIsLiteRT);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isLargeRam = hardwareService.getTotalMemoryGB() > 8;
  const liteRTSliderMax = modelMaxContext ?? (isLargeRam ? 32768 : 12288);
  const liteRTWarnThreshold = isLargeRam ? 16384 : 8192;
  const llmSliderMax = modelMaxContext ?? 32768;

  const trackColor = { false: colors.surfaceLight, true: `${colors.primary}80` };
  const maxTokens = settings?.maxTokens || 512;
  const maxTokensLabel = maxTokens >= 1024
    ? `${(maxTokens / 1024).toFixed(1)}K`
    : String(maxTokens);
  const contextLength = settings?.contextLength || 2048;
  const contextLengthLabel = contextLength >= 1024
    ? `${(contextLength / 1024).toFixed(0)}K`
    : String(contextLength);

  return (
    <Card style={styles.section}>
      <Text style={styles.settingHelp}>Configure LLM behavior for text responses.</Text>

      {/* ── Basic Settings ── */}

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Temperature</Text>
          <Text style={styles.sliderValue}>{(settings?.temperature || 0.7).toFixed(2)}</Text>
        </View>
        <Text style={styles.sliderDesc}>Higher = more creative, Lower = more focused</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={2}
          step={0.05}
          value={settings?.temperature || 0.7}
          onSlidingComplete={(value) => updateSettings({ temperature: value })}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface}
          thumbTintColor={colors.primary}
        />
      </View>

      {!isLiteRT && (
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
      )}

      {isLiteRT ? (
        <View style={styles.sliderSection}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Max Tokens</Text>
            <Text style={styles.sliderValue}>{contextLengthLabel}</Text>
          </View>
          <Text style={styles.sliderDesc}>Total context window — input + history + output combined (requires reload)</Text>
          {contextLength > liteRTWarnThreshold && (
            <Text style={[styles.sliderDesc, { color: '#F59E0B' }]}>
              High context uses significant RAM — may slow or crash on some devices
            </Text>
          )}
          <Slider
            style={styles.slider}
            minimumValue={512}
            maximumValue={liteRTSliderMax}
            step={1024}
            value={contextLength}
            onSlidingComplete={(value) => updateSettings({ contextLength: value })}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.surface}
            thumbTintColor={colors.primary}
          />
        </View>
      ) : (
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
      )}

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

      <AdvancedToggle isExpanded={showAdvanced} onPress={() => setShowAdvanced(!showAdvanced)} testID="text-advanced-toggle" />

      {showAdvanced && <TextGenerationAdvanced isLiteRT={isLiteRT} />}
    </Card>
  );
};
