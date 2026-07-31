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

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <Icon name="check-circle" size={18} color={colors.primary} />
        <Text style={styles.statusText}>{statusLine}</Text>
      </View>

      {hasSyncScreen ? (
        <TouchableOpacity
          style={styles.syncRow}
          onPress={() => navigation.navigate('Sync')}
          accessibilityRole="button"
          accessibilityLabel="Manage licensed devices in Sync"
        >
          <Icon name="monitor" size={16} color={colors.textMuted} />
          <View style={styles.syncInfo}>
            <Text style={styles.syncTitle}>Manage licensed devices</Text>
            <Text style={styles.syncHint}>View or deactivate devices from Sync</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}

      {tierMeta?.renews ? (
        <View style={styles.manageBlock}>
          <Text style={styles.sectionLabel}>Manage subscription</Text>
          <View style={styles.manageRow}>
            <Icon name="mail" size={14} color={colors.textMuted} />
            <Text style={styles.manageHint}>
              To cancel or update your payment method, use the link in your Off Grid AI purchase or
              renewal email. RevenueCat sends one with every payment.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) =>
  ({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.lg,
      marginHorizontal: SPACING.xl,
      marginBottom: SPACING.xl,
      gap: SPACING.sm as number,
      ...shadows.small,
    },
    statusRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.sm,
    },
    statusText: { ...TYPOGRAPHY.body, color: colors.text },
    sectionLabel: {
      ...TYPOGRAPHY.label,
      textTransform: 'uppercase' as const,
      color: colors.textMuted,
      letterSpacing: 0.3,
      marginTop: SPACING.sm,
    },
    syncRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.md,
      minHeight: 44,
      marginTop: SPACING.sm,
    },
    syncInfo: { flex: 1, gap: SPACING.xs },
    syncTitle: { ...TYPOGRAPHY.bodySmall, color: colors.text },
    syncHint: { ...TYPOGRAPHY.meta, color: colors.textMuted },
    manageBlock: {
      marginTop: SPACING.sm,
      gap: SPACING.sm as number,
    },
    manageRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: SPACING.md,
    },
    manageHint: { ...TYPOGRAPHY.meta, color: colors.textMuted, flex: 1 },
  });
