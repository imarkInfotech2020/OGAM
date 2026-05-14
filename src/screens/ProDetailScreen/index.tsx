import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemeColors, ThemeShadows } from '../../theme';
import { SPACING, TYPOGRAPHY } from '../../constants';
import { useAppStore } from '../../stores/appStore';
import { MadeWithLove } from '../../components/MadeWithLove';
import { submitProEmail } from '../../utils/proPrompt';
import logger from '../../utils/logger';

const FEATURES = [
  { icon: 'mic', title: 'Voice AI + Personas', desc: 'Talk to named AI assistants with personality and memory.' },
  { icon: 'calendar', title: 'Calendar Integration', desc: 'Read schedule, create events.' },
  { icon: 'mail', title: 'Email Integration', desc: 'Read inbox, draft replies.' },
  { icon: 'message-square', title: 'WhatsApp + Slack', desc: 'Summarize, draft, catch up.' },
  { icon: 'server', title: 'Custom MCP Servers', desc: 'Connect tools. Extend your AI.' },
];

export const ProDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const setHasRegisteredPro = useAppStore(s => s.setHasRegisteredPro);

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValidEmail = email.includes('@') && email.includes('.');

  const handleSubmit = async () => {
    if (!isValidEmail || loading) return;
    setLoading(true);
    logger.log('[ProDetail] Submitting email:', email);
    try {
      const result = await submitProEmail(email);
      logger.log('[ProDetail] Submit success:', JSON.stringify(result));
    } catch (err) {
      logger.error('[ProDetail] Submit failed:', err);
    } finally {
      setHasRegisteredPro(true);
      setSubmitted(true);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-left" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <Text style={styles.title}>Off Grid PRO</Text>
          <Text style={styles.subtitle}>Lifetime access - Coming soon</Text>

          {/* Features */}
          <View style={styles.featureList}>
            {FEATURES.map(f => (
              <View key={f.title} style={styles.featureRow}>
                <View style={styles.featureIconWrap}>
                  <Icon name={f.icon} size={14} color={colors.textSecondary} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Pitch */}
          <Text style={styles.pitch}>
            The first 100 get lifetime PRO at the lowest price we'll ever offer.
            Register now - we'll send your purchase link when it's live.
          </Text>

          {/* Email input or confirmation */}
          {submitted ? (
            <View style={styles.successRow}>
              <Icon name="check-circle" size={16} color={colors.primary} />
              <Text style={styles.successText}>You're in. We'll be in touch.</Text>
            </View>
          ) : (
            <View style={styles.inputSection}>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.ctaButton, (!isValidEmail || loading) && styles.ctaButtonDisabled]}
                onPress={handleSubmit}
                disabled={!isValidEmail || loading}
              >
                <Text style={styles.ctaText}>{loading ? 'Registering...' : 'I am in 🔥'}</Text>
              </TouchableOpacity>
            </View>
          )}

          <MadeWithLove />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  backButton: {
    padding: SPACING.sm,
    alignSelf: 'flex-start' as const,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: colors.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textMuted,
    marginBottom: SPACING.xl,
  },
  featureList: {
    gap: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  featureRow: {
    flexDirection: 'row' as const,
    gap: SPACING.md,
  },
  featureIconWrap: {
    width: 28,
    alignItems: 'center' as const,
    paddingTop: 2,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    marginBottom: 2,
  },
  featureDesc: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
  },
  pitch: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  inputSection: {
    gap: SPACING.sm,
  },
  input: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: colors.surface,
  },
  ctaButton: {
    paddingVertical: SPACING.md,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  ctaButtonDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    ...TYPOGRAPHY.body,
    color: colors.background,
  },
  successRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  successText: {
    ...TYPOGRAPHY.body,
    color: colors.primary,
  },
});
