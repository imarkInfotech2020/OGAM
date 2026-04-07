import React, { useEffect } from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { useTTSStore } from '../../stores/ttsStore';
import { SPACING } from '../../constants';

interface TTSButtonProps {
  text: string;
  messageId: string;
}

export const TTSButton: React.FC<TTSButtonProps> = ({ text, messageId }) => {
  const { colors } = useTheme();
  const {
    speak,
    stop,
    isSpeaking,
    isModelLoading,
    isModelLoaded,
    currentMessageId,
    settings,
    isBackboneDownloaded,
    isVocoderDownloaded,
    loadModels,
  } = useTTSStore();

  const areBothDownloaded = isBackboneDownloaded && isVocoderDownloaded;
  const isThisMessageSpeaking = isSpeaking && currentMessageId === messageId;

  const opacity = useSharedValue(1);
  useEffect(() => {
    if (isThisMessageSpeaking) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      opacity.value = withTiming(1, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThisMessageSpeaking]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Don't render in Audio Mode, or if TTS disabled / not downloaded
  if (
    settings.interfaceMode === 'audio' ||
    !settings.enabled ||
    !areBothDownloaded
  ) {
    return null;
  }

  if (isModelLoading && currentMessageId === messageId) {
    return <ActivityIndicator size="small" color={colors.textMuted} style={styles.button} />;
  }

  const handlePress = () => {
    if (isThisMessageSpeaking) {
      stop();
      return;
    }
    if (!isModelLoaded) {
      loadModels().then(() => {
        useTTSStore.getState().speak(text, messageId);
      });
      return;
    }
    speak(text, messageId);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      testID={`tts-button-${messageId}`}
    >
      <Animated.View style={isThisMessageSpeaking ? animatedStyle : undefined}>
        <Icon
          name={isThisMessageSpeaking ? 'volume-2' : 'volume-1'}
          size={14}
          color={isThisMessageSpeaking ? colors.primary : colors.textMuted}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: SPACING.xs,
  },
});
