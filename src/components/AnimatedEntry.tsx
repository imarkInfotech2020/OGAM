import React from 'react';
import { MotiView } from 'moti';
import { useReducedMotion } from 'react-native-reanimated';
import { type ViewStyle } from 'react-native';

export interface AnimatedEntryProps {
  index?: number;
  delay?: number;
  staggerMs?: number;
  maxItems?: number;
  from?: ViewStyle;
  animate?: ViewStyle;
  transition?: Record<string, any>;
  children: React.ReactNode;
}

export function AnimatedEntry({
  index = 0,
  delay,
  staggerMs = 30,
  maxItems = 10,
  from = { opacity: 0, translateY: 12 },
  animate = { opacity: 1, translateY: 0 },
  transition = { type: 'timing' as const, duration: 300 },
  children,
}: AnimatedEntryProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion || index >= maxItems) {
    return <>{children}</>;
  }

  const computedDelay = delay ?? index * staggerMs;

  return (
    <MotiView
      from={from}
      animate={animate}
      transition={{ ...transition, delay: computedDelay }}
    >
      {children}
    </MotiView>
  );
}
