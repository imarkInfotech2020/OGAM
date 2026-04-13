import type { ThemeColors, ThemeShadows } from '../../theme/palettes';

export function createStyles(colors: ThemeColors, _shadows: ThemeShadows) {
  return {
    container: {
      // No flex: 1 - let content size naturally with enableDynamicSizing
    },
    content: {
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 16,
    },
    input: {
      backgroundColor: colors.surfaceLight,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    inputError: {
      borderWidth: 1,
      borderColor: colors.error,
    },
    errorText: {
      color: colors.error,
      fontSize: 12,
      marginTop: 4,
    },
    warningContainer: {
      backgroundColor: colors.errorBackground,
      borderRadius: 8,
      padding: 12,
      marginTop: 12,
    },
    warningText: {
      color: colors.error,
      fontSize: 13,
    },
    helperText: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
    },
    buttonRow: {
      flexDirection: 'row' as const,
      gap: 10,
      marginTop: 16,
    },
    testButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      alignItems: 'center' as const,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
    },
    testButtonDisabled: {
      backgroundColor: colors.surfaceLight,
    },
    testButtonText: {
      color: colors.background,
      fontSize: 15,
      fontWeight: '600' as const,
    },
    testButtonTextDisabled: {
      color: colors.textMuted,
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    saveButtonDisabled: {
      backgroundColor: colors.surfaceLight,
    },
    saveButtonText: {
      color: colors.background,
      fontSize: 15,
      fontWeight: '600' as const,
    },
    saveButtonTextDisabled: {
      color: colors.textMuted,
    },
    modelList: {
      marginTop: 8,
    },
    modelScroll: {
      maxHeight: 81,
    },
    modelItem: {
      backgroundColor: colors.surfaceLight,
      borderRadius: 6,
      paddingVertical: 4,
      paddingHorizontal: 8,
      marginBottom: 3,
    },
    modelName: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.text,
    },
    statusContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginTop: 8,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    statusDotSuccess: {
      backgroundColor: colors.success,
    },
    statusDotError: {
      backgroundColor: colors.error,
    },
    statusText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    sectionHeader: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.text,
      marginTop: 20,
      marginBottom: 8,
    },
    notesInput: {
      minHeight: 80,
      textAlignVertical: 'top' as const,
    },
    apiKeyContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
    apiKeyInput: {
      flex: 1,
      marginRight: 8,
    },
    apiKeyToggle: {
      padding: 12,
      backgroundColor: colors.surfaceLight,
      borderRadius: 12,
    },
  };
}
