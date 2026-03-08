import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';

export const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: SPACING.xs,
    marginRight: SPACING.md,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
    fontWeight: '500' as const,
  },
  addButton: {
    padding: SPACING.sm,
  },
  indexingBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  indexingText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: SPACING.xxl,
  },
  emptyText: {
    ...TYPOGRAPHY.h3,
    color: colors.text,
    marginTop: SPACING.md,
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textMuted,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  addFirstButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
  },
  addFirstButtonText: {
    ...TYPOGRAPHY.body,
    color: colors.surface,
    fontWeight: '500' as const,
  },
  listContent: {
    paddingBottom: SPACING.xxl,
  },
  list: {
    flex: 1,
  },
  docRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  docInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  docName: {
    ...TYPOGRAPHY.body,
    color: colors.text,
  },
  docSize: {
    ...TYPOGRAPHY.labelSmall,
    color: colors.textMuted,
    marginTop: 2,
  },
  docDelete: {
    padding: SPACING.sm,
    marginLeft: SPACING.sm,
  },
});