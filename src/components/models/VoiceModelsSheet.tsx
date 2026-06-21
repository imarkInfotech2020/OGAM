import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { AppSheet } from '../../components/AppSheet';
import { getSlot, SLOTS } from '../../bootstrap/slotRegistry';
import { useThemedStyles } from '../../theme';
import type { ThemeColors } from '../../theme';
import { TYPOGRAPHY, SPACING } from '../../constants';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// The pro Voice panel is a ScrollView, which collapses to zero height inside a
// content-sized sheet. Give the content a definite height so it renders.
const PANEL_HEIGHT = Math.round(Dimensions.get('window').height * 0.6);

/**
 * Voice (TTS) model picker — reuses the pro Voice panel (engine selection +
 * link to voice options) rendered via the modelsScreen.voiceTab slot. Renders an
 * empty-state line in free builds where the slot isn't registered.
 */
export const VoiceModelsSheet: React.FC<Props> = ({ visible, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const VoicePanel = getSlot(SLOTS.modelsScreenVoiceTab);

  return (
    <AppSheet visible={visible} onClose={onClose} title="VOICE MODEL" enableDynamicSizing>
      <View style={styles.content}>
        {VoicePanel ? <VoicePanel /> : <Text style={styles.empty}>Voice models aren&apos;t available in this build.</Text>}
      </View>
    </AppSheet>
  );
};

const createStyles = (colors: ThemeColors) => ({
  content: { height: PANEL_HEIGHT },
  empty: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, padding: SPACING.lg, textAlign: 'center' as const },
});
