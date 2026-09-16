import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors } from '../theme';
import { AnimatedPressable } from './AnimatedPressable';

export const RequiredThinkingAdviceCard: React.FC<{
  modelName: string;
  required: boolean;
}> = ({ modelName, required }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState(false);

  if (!required || dismissed) return null;

  return (
    <View style={styles.card} testID="required-thinking-advice">
      <View style={styles.headerRow}>
        <Icon
          name="info"
          size={14}
          color={colors.primary}
          style={styles.leadIcon}
        />
        <Text style={styles.title}>Thinking is required</Text>
        <AnimatedPressable
          onPress={() => setDismissed(true)}
          hitSlop={8}
          accessibilityLabel="Dismiss"
          testID="required-thinking-advice-dismiss"
        >
          <Icon name="x" size={16} color={colors.textSecondary} />
        </AnimatedPressable>
      </View>
      <Text style={styles.intro}>
        {modelName} requires thinking for every response. Off Grid keeps it on
        for this model, even when the general Thinking setting is off.
      </Text>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: SPACING.xs,
  },
  leadIcon: { marginRight: SPACING.xs },
  title: { ...TYPOGRAPHY.h3, color: colors.text, flex: 1 },
  intro: { ...TYPOGRAPHY.meta, color: colors.textSecondary },
});
