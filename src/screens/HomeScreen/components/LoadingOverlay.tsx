import React from 'react';
import { View, Text, Modal, ActivityIndicator } from 'react-native';
import { useTheme, useThemedStyles } from '../../../theme';
import { createStyles } from '../styles';
import { LoadingState } from '../hooks/useHomeScreen';

type Props = {
  loadingState: LoadingState;
};

export const LoadingOverlay: React.FC<Props> = ({ loadingState }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Modal
      visible={loadingState.isLoading}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.loadingOverlay}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingTitle}>
            {loadingState.type === 'text' ? 'Loading Text Model' : 'Loading Image Model'}
          </Text>
          <Text style={styles.loadingModelName} numberOfLines={2}>
            {loadingState.modelName || 'Please wait...'}
          </Text>
          <Text style={styles.loadingHint}>
            This may take a moment for larger models.{'\n'}
            The app will be unresponsive during loading.
          </Text>
        </View>
      </View>
    </Modal>
  );
};
