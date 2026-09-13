import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { LoadingDots } from './LoadingDots';

interface ThinkingIndicatorProps {
  text?: string;
  textStyle?: any;
}

/** The three-dot loader, with a label when the caller supplies one. */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  text,
  textStyle
}) => {
  const { colors } = useTheme();

  return (
    <View style={styles.thinkingContainer}>
      <LoadingDots style={text ? styles.thinkingDots : undefined} />
      {!!text && <Text style={[styles.thinkingText, { color: colors.textSecondary }, textStyle]}>{text}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thinkingDots: {
    marginRight: 8,
  },
  thinkingText: {
    fontSize: 12,
    // No italic. Callers style this with TYPOGRAPHY tokens, which name Menlo, and Menlo does not
    // exist on Android. Android falls back to another face and SYNTHESISES the slant, so it
    // measures the line with one typeface and draws it with another: "Looking for servers on
    // your Wi-Fi" lost its last word, with the space it needed still empty to the right. iOS has
    // Menlo, measures and draws the same face, and read correctly - which is why this only
    // showed on one platform. The terminal type has no italic anyway.
    flexShrink: 1,
  },
});
