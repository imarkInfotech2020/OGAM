import React from 'react';
import { View, Text, Switch, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { NumericStepper } from '../NumericStepper';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemeColors, ThemeShadows } from '../../theme';
import { SPACING } from '../../constants';
import { useTTSStore } from '../../stores/ttsStore';
import { createStyles as createModalStyles } from './styles';

const createLocalStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  modeChipDisabled: { opacity: 0.4 as const },
  linkButton: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: SPACING.sm,
  },
  linkButtonRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.xs },
  flex1: { flex: 1 },
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: SPACING.lg,
  },
  toggleInfo: { flex: 1 },
  noBottomMargin: { marginBottom: 0 },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: SPACING.lg },
  voiceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: SPACING.sm,
  },
  voiceRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  voiceInfo: { flex: 1 },
  voiceName: { fontSize: 13, color: colors.text },
  voiceMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  voiceSectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: SPACING.sm,
  },
  voiceSectionLabel: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
  downloadRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.sm, marginBottom: SPACING.md },
  downloadText: { fontSize: 12, color: colors.textSecondary, flex: 1 },
});

// ── Mode Picker ──────────────────────────────────────────────────────────────

const ModePicker: React.FC<{ audioAvailable: boolean }> = ({ audioAvailable }) => {
  const modal = useThemedStyles(createModalStyles);
  const local = useThemedStyles(createLocalStyles);
  const { settings, updateSettings, initializeEngine } = useTTSStore();
  const mode = settings.interfaceMode;

  const handleModeChange = (next: 'chat' | 'audio') => {
    if (next === 'audio' && !audioAvailable) return;
    updateSettings({ interfaceMode: next });
    if (next === 'audio') initializeEngine();
  };

  return (
    <View style={modal.modeToggleContainer}>
      <View style={modal.modeToggleInfo}>
        <Text style={modal.modeToggleLabel}>Interface Mode</Text>
        <Text style={modal.modeToggleDesc}>
          {mode === 'audio'
            ? 'Audio Mode — responses rendered as voice notes'
            : 'Chat Mode — play button added to text messages'}
        </Text>
      </View>
      <View style={modal.modeToggleButtons}>
        {(['chat', 'audio'] as const).map((m) => {
          const active = mode === m;
          const disabled = m === 'audio' && !audioAvailable;
          return (
            <TouchableOpacity
              key={m}
              style={[modal.modeButton, active && modal.modeButtonActive, disabled && local.modeChipDisabled]}
              onPress={() => handleModeChange(m)}
              disabled={disabled}
            >
              <Text style={[modal.modeButtonText, active && modal.modeButtonTextActive]}>
                {m === 'chat' ? 'Chat' : 'Audio'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ── Voice Picker ─────────────────────────────────────────────────────────────

const VoicePicker: React.FC = () => {
  const { colors } = useTheme();
  const local = useThemedStyles(createLocalStyles);
  const { voices, activeVoiceId, isReady, isDownloading, overallDownloadProgress, setVoice } = useTTSStore();

  return (
    <View>
      <View style={local.voiceSectionHeader}>
        <Text style={local.voiceSectionLabel}>Voice</Text>
        {isDownloading && (
          <Text style={local.voiceSectionLabel}>{Math.round(overallDownloadProgress * 100)}%</Text>
        )}
        {!isReady && !isDownloading && (
          <ActivityIndicator size="small" color={colors.textMuted} />
        )}
        {isReady && (
          <Icon name="check-circle" size={12} color={colors.primary} />
        )}
      </View>

      {voices.map((voice, i) => {
        const active = voice.id === activeVoiceId;
        return (
          <TouchableOpacity
            key={voice.id}
            style={[local.voiceRow, i > 0 && local.voiceRowBorder]}
            onPress={() => setVoice(voice.id)}
          >
            <View style={local.voiceInfo}>
              <Text style={local.voiceName}>{voice.label}</Text>
              <Text style={local.voiceMeta}>
                {voice.metadata.accent ? `${voice.metadata.accent} · ` : ''}
                {voice.metadata.gender || ''}
              </Text>
            </View>
            {active && <Icon name="check" size={13} color={colors.primary} />}
          </TouchableOpacity>
        );
      })}

      <View style={[local.divider, { marginTop: SPACING.md }]} />
    </View>
  );
};

// ── Main TTS Section ─────────────────────────────────────────────────────────

interface TTSSectionProps {
  onNavigateToTTSSettings?: () => void;
}

export const TTSSection: React.FC<TTSSectionProps> = ({ onNavigateToTTSSettings }) => {
  const { colors } = useTheme();
  const modal = useThemedStyles(createModalStyles);
  const local = useThemedStyles(createLocalStyles);
  const { settings, updateSettings, isReady } = useTTSStore();

  const trackColor = { false: colors.surfaceLight, true: `${colors.primary}80` };
  const isChatMode = settings.interfaceMode === 'chat';

  if (!isReady) {
    return (
      <View style={modal.sectionCard}>
        <Text style={modal.settingDescription}>
          No voice models downloaded. Go to TTS Settings to download them.
        </Text>
        {onNavigateToTTSSettings && (
          <TouchableOpacity style={local.linkButton} onPress={onNavigateToTTSSettings}>
            <View style={local.linkButtonRow}>
              <Icon name="external-link" size={13} color={colors.textSecondary} />
              <Text style={modal.modeButtonText}>TTS Settings</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={modal.sectionCard}>
      <ModePicker audioAvailable={isReady} />

      {isChatMode && (
        <View style={local.toggleRow}>
          <View style={local.toggleInfo}>
            <Text style={modal.modeToggleLabel}>Enable TTS</Text>
            <Text style={modal.modeToggleDesc}>Show play buttons on assistant messages</Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={(v) => updateSettings({ enabled: v })}
            trackColor={trackColor}
            thumbColor={settings.enabled ? colors.primary : colors.textMuted}
          />
        </View>
      )}

      <VoicePicker />

      <View style={modal.settingGroup}>
        <Text style={modal.settingLabel}>Speed</Text>
        <NumericStepper
          value={settings.speed}
          min={0.5} max={2.0} step={0.1} decimals={1}
          formatValue={(v) => `${v.toFixed(1)}x`}
          onChange={(v) => updateSettings({ speed: v })}
        />
      </View>

      {isChatMode && (
        <View style={[local.toggleRow, local.noBottomMargin]}>
          <View style={local.toggleInfo}>
            <Text style={modal.modeToggleLabel}>Auto-play</Text>
            <Text style={modal.modeToggleDesc}>Speak AI responses automatically</Text>
          </View>
          <Switch
            value={settings.autoPlay}
            onValueChange={(v) => updateSettings({ autoPlay: v })}
            trackColor={trackColor}
            thumbColor={settings.autoPlay ? colors.primary : colors.textMuted}
          />
        </View>
      )}
    </View>
  );
};
