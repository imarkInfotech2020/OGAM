import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

export type HapticType =
  | 'impactLight'
  | 'impactMedium'
  | 'impactHeavy'
  | 'selection'
  | 'notificationSuccess'
  | 'notificationWarning'
  | 'notificationError';

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export function triggerHaptic(type: HapticType): void {
  try {
    ReactNativeHapticFeedback.trigger(type, options);
  } catch {
    // Silent swallow — haptics are non-critical
  }
}
