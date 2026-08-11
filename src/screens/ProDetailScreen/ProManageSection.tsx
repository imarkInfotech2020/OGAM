/**
 * ProManageSection
 *
 * Shown on the Pro screen when a protected credential is saved. Surfaces
 * subscription status from the cached license (lifetime vs yearly + expiry).
 * Active licensed
 * devices are managed from the Pro-owned Sync screen, so there is one list and
 * one action owner rather than a second read-only copy here.
 * For a recurring (yearly) license it explains how to cancel or update payment:
 * via the link RevenueCat emails with every purchase and renewal. There is no
 * in-app portal because RevenueCat authenticates Web Billing customers by email.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { useHasRegisteredScreen } from '../../navigation/screenRegistry';
import type { ThemeColors, ThemeShadows } from '../../theme';
import { SPACING, TYPOGRAPHY } from '../../constants';
import {
  getProLicenseInfo,
  PRO_TIER_META,
  type ProLicenseInfo,
} from '../../services/proLicenseService';
import logger from '../../utils/logger';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export const ProManageSection: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const hasSyncScreen = useHasRegisteredScreen('Sync');
  const [info, setInfo] = useState<ProLicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setInfo(await getProLicenseInfo());
    } catch (e) {
      logger.error('[ProManage] load failed:', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Render from the tier's own semantics (PRO_TIER_META), not a per-tier branch: a
  // recurring tier shows its renewal date, a one-time tier says it never expires.
  const tierMeta = info?.tier ? PRO_TIER_META[info.tier] : null;
  const statusLine = !tierMeta
    ? ''
    : tierMeta.renews
      ? `${tierMeta.label} · renews ${formatDate(info!.expiry)}`
      : `${tierMeta.label} · never expires`;

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const renewing = tierMeta?.renews === true;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Your licence</Text>
      <View style={[styles.row, hasSyncScreen || renewing ? null : styles.lastRow]}>
        <Icon name="check-circle" size={18} color={colors.primary} />
        <Text style={styles.rowTitle}>{statusLine}</Text>
      </View>

      {hasSyncScreen ? (
        <TouchableOpacity
          style={[styles.row, renewing ? null : styles.lastRow]}
          activeOpacity={0.72}
          onPress={() => navigation.navigate('Sync')}
          accessibilityRole="button"
          accessibilityLabel="Manage licensed devices in Sync"
        >
          <Icon name="monitor" size={18} color={colors.primary} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Licensed devices</Text>
            <Text style={styles.rowDescription}>View or deactivate from Sync</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}

      {/* Web Billing authenticates by email, so the only real path to cancelling is that link. */}
      {renewing ? (
        <View style={[styles.row, styles.lastRow]}>
          <Icon name="mail" size={18} color={colors.primary} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Manage subscription</Text>
            <Text style={styles.rowDescription}>
              Use the link in your renewal email to cancel or change payment.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

// The same card as the rest of the app: one surface, an uppercase title, hairline-divided rows.
const createStyles = (colors: ThemeColors, shadows: ThemeShadows) =>
  ({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      marginHorizontal: SPACING.xl,
      marginBottom: SPACING.xl,
      ...shadows.small,
    },
    cardTitle: {
      ...TYPOGRAPHY.label,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.3,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xs,
    },
    row: {
      minHeight: 44,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lastRow: { borderBottomWidth: 0 },
    rowText: { flex: 1, gap: SPACING.xs },
    rowTitle: { ...TYPOGRAPHY.bodySmall, color: colors.text, flex: 1 },
    rowDescription: { ...TYPOGRAPHY.meta, color: colors.textMuted },
  });
