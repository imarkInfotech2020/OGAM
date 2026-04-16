import type { ThemeColors, ThemeShadows } from '../../theme/palettes';

export function createStyles(_colors: ThemeColors, _shadows: ThemeShadows) {
  const colors = _colors;
  return {
    container: {
      flex: 1 as const,
    },
    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.text,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    headerSpacer: {
      width: 24,
      height: 24,
    },
    actionBar: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    actionButton: {
      minWidth: 88,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderRadius: 6,
      gap: 4,
    },
    actionIcon: {
      marginRight: 4,
    },
    actionButtonText: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.primary,
    },
    copyStatusRow: {
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    copyStatusText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    listContent: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    logEntry: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 8,
      backgroundColor: colors.surface,
      borderRadius: 4,
      gap: 8,
    },
    logTime: {
      fontSize: 12,
      color: colors.textSecondary,
      fontFamily: 'monospace',
      minWidth: 80,
    },
    logLevel: {
      fontSize: 12,
      fontWeight: '600' as const,
      fontFamily: 'monospace',
      minWidth: 54,
    },
    logMessage: {
      flex: 1 as const,
      fontSize: 12,
      fontFamily: 'monospace',
    },
    emptyContainer: {
      flex: 1 as const,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
  };
}
