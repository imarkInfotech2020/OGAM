import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../theme';

const wave = css.keyframes({
  '0%': { transform: [{ translateY: 0 }] },
  '50%': { transform: [{ translateY: -7 }] },
  '100%': { transform: [{ translateY: 0 }] },
});

const waveStyles = css.create({
  dot: {
    animationName: wave,
    animationDuration: 1050,
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  second: { animationDelay: 160 },
  third: { animationDelay: 320 },
});

interface LoadingDotsProps {
  /** Kept for existing callers. The dots always use the theme accent. */
  color?: string;
  /** Diameter in points. The dots stay circular at any size. */
  size?: number;
  style?: ViewStyle;
  testID?: string;
}

/**
 * The three-dot busy animation - the ONE loader in this app. It exists as its own component
 * because it had two homes: the animation inside ThinkingIndicator, and a platform
 * ActivityIndicator inside Button. A ring spinner on a button reads as a retry glyph, not as
 * work in progress, so a paired device and a shared file both looked like they had failed.
 * Every busy state renders this, and the animation is defined once.
 */
export const LoadingDots: React.FC<LoadingDotsProps> = ({
  size = 6,
  style,
  testID,
}) => {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const dotStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: colors.primary,
  };

  return (
    <View
      style={[styles.dots, style]}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel="Working"
    >
      <Animated.View style={[styles.dot, dotStyle, reducedMotion ? undefined : waveStyles.dot]} />
      <Animated.View style={[styles.dot, dotStyle, reducedMotion ? undefined : waveStyles.dot, waveStyles.second]} />
      <Animated.View style={[styles.dot, dotStyle, reducedMotion ? undefined : waveStyles.dot, waveStyles.third]} />
    </View>
  );
};

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    // The dots are a fixed width. Without this they give up width to a sibling label on a
    // narrow screen and the animation collapses.
    flexShrink: 0,
  },
  dot: {
    marginHorizontal: 2,
  },
});
