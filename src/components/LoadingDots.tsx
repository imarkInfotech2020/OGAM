import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../theme';

const wave = css.keyframes({
  '0%': { transform: [{ translateY: 0 }] },
  '16.667%': { transform: [{ translateY: -5 }] },
  '50%': { transform: [{ translateY: -5 }] },
  '66.667%': { transform: [{ translateY: 0 }] },
  '100%': { transform: [{ translateY: 0 }] },
});

const waveStyles = css.create({
  dot: {
    animationName: wave,
    animationDuration: 900,
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  second: { animationDelay: 150 },
  third: { animationDelay: 300 },
});

interface LoadingDotsProps {
  /** Dot colour. Defaults to the accent, which is what a surface uses on its own background. */
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
  color,
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
    backgroundColor: color ?? colors.primary,
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
