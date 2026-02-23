import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useThemedStyles } from '../../theme';
import { createStyles } from './styles';
import { SystemPromptSection } from './SystemPromptSection';
import { ImageGenerationSection } from './ImageGenerationSection';
import { TextGenerationSection } from './TextGenerationSection';
import { PerformanceSection } from './PerformanceSection';

export const ModelSettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [promptOpen, setPromptOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [perfOpen, setPerfOpen] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Model Settings</Text>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => setPromptOpen(!promptOpen)}
          activeOpacity={0.7}
          testID="system-prompt-accordion"
        >
          <Text style={styles.accordionTitle}>Default System Prompt</Text>
          <Icon
            name={promptOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {promptOpen && <SystemPromptSection />}

        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => setImageOpen(!imageOpen)}
          activeOpacity={0.7}
          testID="image-generation-accordion"
        >
          <Text style={styles.accordionTitle}>Image Generation</Text>
          <Icon
            name={imageOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {imageOpen && <ImageGenerationSection />}

        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => setTextOpen(!textOpen)}
          activeOpacity={0.7}
          testID="text-generation-accordion"
        >
          <Text style={styles.accordionTitle}>Text Generation</Text>
          <Icon
            name={textOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {textOpen && <TextGenerationSection />}

        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => setPerfOpen(!perfOpen)}
          activeOpacity={0.7}
          testID="performance-accordion"
        >
          <Text style={styles.accordionTitle}>Performance</Text>
          <Icon
            name={perfOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {perfOpen && <PerformanceSection />}
      </ScrollView>
    </SafeAreaView>
  );
};
