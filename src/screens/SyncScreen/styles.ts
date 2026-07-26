import { SPACING, TYPOGRAPHY } from '../../constants';
import type { ThemeColors, ThemeShadows } from '../../theme';

export function createStyles(colors: ThemeColors, _shadows: ThemeShadows) {
  return {
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backButton: { padding: SPACING.xs, marginRight: SPACING.sm },
    title: { ...TYPOGRAPHY.h2, color: colors.text },
    scrollView: { flex: 1 },
    content: { padding: SPACING.md, gap: SPACING.md },
    card: { padding: SPACING.md, borderRadius: 12, backgroundColor: colors.surfaceLight, gap: 4 },
    rowBetween: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    cardTitle: { ...TYPOGRAPHY.label, color: colors.textSecondary },
    deviceName: { ...TYPOGRAPHY.body, color: colors.text },
    statusText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
    hint: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginBottom: SPACING.xs },
    input: {
      ...TYPOGRAPHY.body, color: colors.text, borderWidth: 1, borderColor: colors.border,
      borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, backgroundColor: colors.background,
    },
    sectionLabel: { ...TYPOGRAPHY.label, color: colors.textMuted, marginTop: SPACING.sm },
    empty: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
    deviceRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.sm,
      padding: SPACING.md, borderRadius: 12, backgroundColor: colors.surfaceLight,
    },
    flex1: { flex: 1 },
    deviceRowName: { ...TYPOGRAPHY.body, color: colors.text },
    pairedName: { flex: 1 },
    deviceRowSub: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary },
    pairButton: {
      paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 8,
      backgroundColor: colors.primary, minWidth: 64, alignItems: 'center' as const,
    },
    pairButtonDisabled: { opacity: 0.4 },
    pairButtonText: { ...TYPOGRAPHY.body, color: colors.background },
    dotOn: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  };
}
