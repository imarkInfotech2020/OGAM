import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { useAppStore } from '../stores/appStore';

const PRO_AHA_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const PRO_AHA_MAX_SHOWS = 5;

export const DebugStateScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const textGenerationCount = useAppStore(s => s.textGenerationCount);
  const imageGenerationCount = useAppStore(s => s.imageGenerationCount);
  const hasRegisteredPro = useAppStore(s => s.hasRegisteredPro);
  const proAhaTriggeredBy = useAppStore(s => s.proAhaTriggeredBy);
  const proAhaShowCount = useAppStore(s => s.proAhaShowCount);
  const lastProAhaShownAt = useAppStore(s => s.lastProAhaShownAt);
  const hasEngagedSharePrompt = useAppStore(s => s.hasEngagedSharePrompt);

  const setHasRegisteredPro = useAppStore(s => s.setHasRegisteredPro);
  const setProAhaTriggeredBy = useAppStore(s => s.setProAhaTriggeredBy);
  const setLastProAhaShownAt = useAppStore(s => s.setLastProAhaShownAt);
  const incrementProAhaShowCount = useAppStore(s => s.incrementProAhaShowCount);

  const now = Date.now();
  const cooldownRemaining = lastProAhaShownAt !== null
    ? Math.max(0, PRO_AHA_COOLDOWN_MS - (now - lastProAhaShownAt))
    : null;
  const cooldownDays = cooldownRemaining !== null
    ? (cooldownRemaining / (1000 * 60 * 60 * 24)).toFixed(1)
    : null;
  const lastShownDate = lastProAhaShownAt !== null
    ? new Date(lastProAhaShownAt).toLocaleString()
    : 'Never';

  const handleResetAll = () => {
    setHasRegisteredPro(false);
    setProAhaTriggeredBy(null);
    setLastProAhaShownAt(0);
    // Reset show count via store directly
    useAppStore.setState({ proAhaShowCount: 0 });
  };

  const handleSimulateCooldownExpired = () => {
    // Set lastProAhaShownAt to 8 days ago so cooldown appears expired
    const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
    setLastProAhaShownAt(eightDaysAgo);
    setProAhaTriggeredBy(null);
  };

  const handleIncrementShowCount = () => {
    incrementProAhaShowCount();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Debug State</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Generation Counts */}
        <Text style={styles.sectionTitle}>Generation Counts</Text>
        <View style={styles.card}>
          <Row label="Text generations" value={String(textGenerationCount)} colors={colors} />
          <Row label="Image generations" value={String(imageGenerationCount)} colors={colors} />
          <Row
            label="Share prompt engaged"
            value={hasEngagedSharePrompt ? 'Yes' : 'No'}
            colors={colors}
            highlight={hasEngagedSharePrompt}
          />
        </View>

        {/* PRO Aha State */}
        <Text style={styles.sectionTitle}>PRO Aha Sheet</Text>
        <View style={styles.card}>
          <Row
            label="Registered PRO"
            value={hasRegisteredPro ? 'Yes' : 'No'}
            colors={colors}
            highlight={hasRegisteredPro}
          />
          <Row
            label="Triggered by"
            value={proAhaTriggeredBy ?? 'null (eligible)'}
            colors={colors}
            highlight={proAhaTriggeredBy !== null}
          />
          <Row
            label="Show count"
            value={`${proAhaShowCount} / ${PRO_AHA_MAX_SHOWS}`}
            colors={colors}
            highlight={proAhaShowCount >= PRO_AHA_MAX_SHOWS}
          />
          <Row
            label="Max shows reached"
            value={proAhaShowCount >= PRO_AHA_MAX_SHOWS ? 'Yes - will never show' : 'No'}
            colors={colors}
            highlight={proAhaShowCount >= PRO_AHA_MAX_SHOWS}
          />
        </View>

        {/* Cooldown */}
        <Text style={styles.sectionTitle}>Cooldown (7 days)</Text>
        <View style={styles.card}>
          <Row label="Last shown at" value={lastShownDate} colors={colors} />
          <Row
            label="Cooldown active"
            value={cooldownRemaining !== null && cooldownRemaining > 0 ? 'Yes' : 'No'}
            colors={colors}
            highlight={cooldownRemaining !== null && cooldownRemaining > 0}
          />
          <Row
            label="Cooldown remaining"
            value={cooldownDays !== null && Number(cooldownDays) > 0 ? `${cooldownDays} days` : 'Expired / not started'}
            colors={colors}
          />
        </View>

        {/* What will happen next */}
        <Text style={styles.sectionTitle}>Next Generation Will...</Text>
        <View style={styles.card}>
          <Text style={styles.prediction}>{getNextGenPrediction({
            hasRegisteredPro,
            proAhaShowCount,
            proAhaTriggeredBy,
            lastProAhaShownAt,
            textGenerationCount,
            imageGenerationCount,
            now,
          })}</Text>
        </View>

        {/* Actions */}
        <Text style={styles.sectionTitle}>Debug Actions</Text>
        <View style={styles.actionGroup}>
          <TouchableOpacity style={styles.actionButton} onPress={handleResetAll}>
            <Text style={styles.actionText}>Reset all PRO state</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleSimulateCooldownExpired}>
            <Text style={styles.actionText}>Simulate cooldown expired (set last shown to 8 days ago)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleIncrementShowCount}>
            <Text style={styles.actionText}>Increment show count (+1)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => useAppStore.setState({ proAhaShowCount: PRO_AHA_MAX_SHOWS })}>
            <Text style={styles.actionText}>Max out show count (force permanent block)</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

function getNextGenPrediction(s: {
  hasRegisteredPro: boolean;
  proAhaShowCount: number;
  proAhaTriggeredBy: string | null;
  lastProAhaShownAt: number | null;
  textGenerationCount: number;
  imageGenerationCount: number;
  now: number;
}): string {
  if (s.hasRegisteredPro) return 'PRO sheet will NOT show (user registered). Share sheet unaffected.';
  if (s.proAhaShowCount >= PRO_AHA_MAX_SHOWS) return 'PRO sheet will NOT show (max 5 shows reached permanently). Share sheet unaffected.';
  const cooldownActive = s.lastProAhaShownAt !== null && s.now - s.lastProAhaShownAt < PRO_AHA_COOLDOWN_MS;
  if (cooldownActive) return 'PRO sheet will NOT show (cooldown active). Share sheet may show at gen 10, 20, etc.';
  if (s.proAhaTriggeredBy !== null) return 'PRO sheet will NOT show (already fired this cycle, cooldown not yet expired). Share sheet unaffected.';
  if (s.textGenerationCount < 3) return `PRO sheet will NOT show yet (need ${3 - s.textGenerationCount} more text gens). Share sheet shows at gen 2.`;
  return 'PRO sheet WILL show on next text or image generation (threshold met, cooldown clear, cycle open).';
}

const Row: React.FC<{ label: string; value: string; colors: ThemeColors; highlight?: boolean }> = ({ label, value, colors, highlight }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
    <Text style={{ ...TYPOGRAPHY.bodySmall as object, color: colors.textSecondary, flex: 1 }}>{label}</Text>
    <Text style={{ ...TYPOGRAPHY.bodySmall as object, color: highlight ? colors.primary : colors.text, fontWeight: '400', flex: 1, textAlign: 'right' }}>{value}</Text>
  </View>
);

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.small,
  },
  backButton: { width: 36, padding: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.h2, color: colors.text },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  sectionTitle: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    ...shadows.small,
  },
  prediction: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.text,
    padding: SPACING.md,
    lineHeight: 20,
  },
  actionGroup: { gap: SPACING.sm },
  actionButton: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: SPACING.md,
    ...shadows.small,
  },
  actionText: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
});
