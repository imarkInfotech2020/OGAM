import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AppSheet } from '../../../components/AppSheet';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { useTheme, useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';
import { WHISPER_MODELS } from '../../../services';
import { useWhisperStore } from '../../../stores/whisperStore';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Transcription (Whisper) model picker. Whisper keeps a single active STT model,
 * so selecting a model downloads it (auto-loading) and replaces the previous one.
 */
export const WhisperPickerSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const downloadedModelId = useWhisperStore((s) => s.downloadedModelId);
  const isDownloading = useWhisperStore((s) => s.isDownloading);
  const downloadProgress = useWhisperStore((s) => s.downloadProgress);
  const downloadModel = useWhisperStore((s) => s.downloadModel);
  const deleteModel = useWhisperStore((s) => s.deleteModel);

  return (
    <AppSheet visible={visible} onClose={onClose} title="TRANSCRIPTION MODEL" enableDynamicSizing>
      <View style={styles.content}>
        {WHISPER_MODELS.map((m) => {
          const isActive = downloadedModelId === m.id;
          const busy = isDownloading && !isActive;
          return (
            <AnimatedPressable
              key={m.id}
              style={[styles.row, isActive && styles.rowActive]}
              hapticType="selection"
              disabled={isDownloading}
              onPress={() => { if (!isActive) downloadModel(m.id); }}
            >
              <View style={styles.rowInfo}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}{m.lang === 'multi' ? ' · 99 langs' : ' · EN'}
                </Text>
                <Text style={styles.desc} numberOfLines={1}>{m.description}</Text>
                <Text style={styles.meta}>{m.size} MB</Text>
              </View>
              {(() => {
                if (busy) return <ActivityIndicator size="small" color={colors.primary} />;
                if (isActive) {
                  return (
                    <AnimatedPressable hapticType="selection" hitSlop={8} onPress={() => deleteModel()}>
                      <Icon name="trash-2" size={16} color={colors.textMuted} />
                    </AnimatedPressable>
                  );
                }
                return <Icon name="download" size={16} color={colors.textMuted} />;
              })()}
            </AnimatedPressable>
          );
        })}
        {isDownloading && (
          <Text style={styles.progress}>Downloading… {Math.round(downloadProgress * 100)}%</Text>
        )}
      </View>
    </AppSheet>
  );
};

const createStyles = (colors: ThemeColors) => ({
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xl, gap: SPACING.sm as number },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowActive: { borderColor: colors.primary },
  rowInfo: { flex: 1, gap: 2 as number },
  name: { ...TYPOGRAPHY.body, color: colors.text },
  desc: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
  meta: { ...TYPOGRAPHY.meta, color: colors.textMuted },
  progress: { ...TYPOGRAPHY.meta, color: colors.textMuted, textAlign: 'center' as const, marginTop: SPACING.sm },
});
