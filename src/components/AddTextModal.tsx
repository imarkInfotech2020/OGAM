import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { AppSheet } from './AppSheet';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { ragService } from '../services/rag';
import { TYPOGRAPHY, SPACING } from '../constants';

const MIN_CHARS = 100;
const PASTE_MAX_CHARS = 50_000;
const WARN_CHARS = 40_000;

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  titleInput: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  contentInput: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    minHeight: 220,
    textAlignVertical: 'top' as const,
  },
  footer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  hintText: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
  },
  errorText: {
    ...TYPOGRAPHY.meta,
    color: colors.error,
  },
  counterDefault: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
  },
  counterWarn: {
    ...TYPOGRAPHY.meta,
    color: colors.trending,
  },
  counterError: {
    ...TYPOGRAPHY.meta,
    color: colors.error,
  },
  saveButton: {
    borderRadius: 6,
    paddingVertical: SPACING.md,
    alignItems: 'center' as const,
  },
  saveButtonActive: {
    backgroundColor: colors.primary,
  },
  saveButtonDisabled: {
    backgroundColor: colors.surfaceHover,
  },
  saveButtonTextActive: {
    ...TYPOGRAPHY.body,
    color: colors.surface,
  },
  saveButtonTextDisabled: {
    ...TYPOGRAPHY.body,
    color: colors.textMuted,
  },
});

function autoTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
  return words || 'Untitled Note';
}

export interface AddTextModalProps {
  visible: boolean;
  projectId: string;
  onClose: () => void;
  onIndexed: () => void;
}

export const AddTextModal: React.FC<AddTextModalProps> = ({ visible, projectId, onClose, onIndexed }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [indexing, setIndexing] = useState(false);

  const charCount = text.length;
  const tooShort = charCount > 0 && charCount < MIN_CHARS;
  const tooLong = charCount > PASTE_MAX_CHARS;
  const canSave = charCount >= MIN_CHARS && !tooLong && !indexing;

  const counterStyle = tooLong
    ? styles.counterError
    : charCount >= WARN_CHARS
    ? styles.counterWarn
    : styles.counterDefault;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const resolvedTitle = title.trim() || autoTitle(text);
    setIndexing(true);
    try {
      await ragService.indexTextContent({ projectId, title: resolvedTitle, text });
      setTitle('');
      setText('');
      onIndexed();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add text');
    } finally {
      setIndexing(false);
    }
  }, [canSave, title, text, projectId, onIndexed, onClose]);

  const handleClose = useCallback(() => {
    if (indexing) return;
    setTitle('');
    setText('');
    onClose();
  }, [indexing, onClose]);

  return (
    <AppSheet
      visible={visible}
      onClose={handleClose}
      onHeaderClosePress={handleClose}
      title="Add Text"
      closeLabel="Cancel"
      snapPoints={['90%']}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Title (optional — auto-fills from content)"
          placeholderTextColor={colors.textMuted}
          maxLength={100}
          returnKeyType="next"
          editable={!indexing}
        />

        <TextInput
          style={styles.contentInput}
          value={text}
          onChangeText={setText}
          placeholder="Paste or type text here..."
          placeholderTextColor={colors.textMuted}
          multiline
          scrollEnabled={false}
          editable={!indexing}
        />

        <View style={styles.footer}>
          {tooShort ? (
            <Text style={styles.hintText}>{`min ${MIN_CHARS} characters`}</Text>
          ) : tooLong ? (
            <Text style={styles.errorText}>{`max ${PASTE_MAX_CHARS.toLocaleString()} characters`}</Text>
          ) : (
            <View />
          )}
          <Text style={counterStyle}>
            {`${charCount.toLocaleString()} / ${PASTE_MAX_CHARS.toLocaleString()}`}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, canSave ? styles.saveButtonActive : styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.8}
        >
          {indexing ? (
            <ActivityIndicator size="small" color={colors.surface} />
          ) : (
            <Text style={canSave ? styles.saveButtonTextActive : styles.saveButtonTextDisabled}>
              Save to knowledge base
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </AppSheet>
  );
};
