/**
 * DebugLiteRTScreen
 *
 * Development screen to test LiteRT-LM inference end-to-end.
 * Accessible from Settings. Not shown in production nav.
 *
 * Usage:
 *   1. adb push model.litertlm /data/data/ai.offgridmobile.localdream/files/model.litertlm
 *   2. Open this screen, enter the path, pick backend, tap Load
 *   3. Enter a message, tap Send, watch tokens stream
 *   4. Use the Logs panel to copy/clear debug output
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Clipboard,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { liteRTService, LiteRTBackend } from '../services/litert';
import RNFS from 'react-native-fs';

const DEFAULT_MODEL_PATH = `${RNFS.DocumentDirectoryPath}/models/gemma-4-E2B-it.litertlm`;
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';

type LogLevel = 'info' | 'warn' | 'error' | 'success';
interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  time: string;
}

let logIdCounter = 0;

function logColor(level: LogLevel, colors: ThemeColors): string {
  switch (level) {
    case 'error':   return colors.error ?? '#FF453A';
    case 'warn':    return '#FF9F0A';
    case 'success': return '#30D158';
    default:        return colors.textSecondary;
  }
}

export const DebugLiteRTScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Model config
  const [modelPath, setModelPath] = useState(DEFAULT_MODEL_PATH);
  const [backend, setBackend] = useState<LiteRTBackend>('gpu');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  // State
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeBackend, setActiveBackend] = useState<string | null>(null);

  // Chat
  const [messageInput, setMessageInput] = useState('');
  const [response, setResponse] = useState('');

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsScrollRef = useRef<ScrollView>(null);
  const responseScrollRef = useRef<ScrollView>(null);

  const addLog = useCallback((level: LogLevel, message: string) => {
    const entry: LogEntry = {
      id: logIdCounter++,
      level,
      message,
      time: new Date().toISOString().substring(11, 23),
    };
    setLogs(prev => [...prev, entry]);
    setTimeout(() => logsScrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  // ---------------------------------------------------------------------------
  // Load model
  // ---------------------------------------------------------------------------

  const handleLoad = async () => {
    if (isLoading) return;
    addLog('info', `Loading model: ${modelPath}`);
    addLog('info', `Requested backend: ${backend}`);
    setIsLoading(true);
    setIsLoaded(false);
    setActiveBackend(null);
    setResponse('');

    try {
      const exists = await RNFS.exists(modelPath);
      if (!exists) {
        addLog('error', `File not found: ${modelPath}`);
        addLog('warn', `Push via ADB:\nadb push model.litertlm ${modelPath}`);
        Alert.alert('File not found', `No .litertlm file at:\n${modelPath}`);
        return;
      }

      addLog('info', 'File exists on disk, initializing engine...');
      await liteRTService.loadModel(modelPath, backend);

      const actual = liteRTService.getActiveBackend();
      setActiveBackend(actual);
      setIsLoaded(true);

      if (actual !== backend) {
        addLog('warn', `Requested ${backend} but fell back to ${actual}`);
      } else {
        addLog('success', `Model loaded on ${actual?.toUpperCase()}`);
      }

      if (liteRTService.isNPU()) {
        addLog('warn', 'NPU: temperature/topK/topP sampling settings are inactive on this backend');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog('error', `Load failed: ${msg}`);
      Alert.alert('Load failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const handleSend = async () => {
    if (!isLoaded || isGenerating || !messageInput.trim()) return;
    const text = messageInput.trim();
    setMessageInput('');
    setResponse('');
    setIsGenerating(true);
    addLog('info', `Resetting conversation with system prompt...`);

    try {
      await liteRTService.resetConversation(systemPrompt);
      addLog('info', `Sending: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);

      let tokenCount = 0;
      const startMs = Date.now();

      await liteRTService.sendMessage(text, {
        onToken: (token) => {
          tokenCount++;
          setResponse(prev => prev + token);
          if (tokenCount % 20 === 0) {
            responseScrollRef.current?.scrollToEnd({ animated: false });
          }
        },
        onReasoning: (token) => {
          addLog('info', `[thinking] ${token.substring(0, 60)}`);
        },
        onComplete: (fullContent, fullReasoning) => {
          const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
          const tps = (tokenCount / parseFloat(elapsed)).toFixed(1);
          addLog('success', `Done — ${tokenCount} tokens in ${elapsed}s (${tps} tok/s)`);
          if (fullReasoning) {
            addLog('info', `Reasoning: ${fullReasoning.length} chars`);
          }
          setIsGenerating(false);
        },
        onError: (err) => {
          addLog('error', `Generation error: ${err.message}`);
          setIsGenerating(false);
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog('error', `Send failed: ${msg}`);
      setIsGenerating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Stop
  // ---------------------------------------------------------------------------

  const handleStop = async () => {
    addLog('info', 'Stopping generation...');
    await liteRTService.stopGeneration();
    setIsGenerating(false);
    addLog('info', 'Stopped');
  };

  // ---------------------------------------------------------------------------
  // Unload
  // ---------------------------------------------------------------------------

  const handleUnload = async () => {
    addLog('info', 'Unloading model...');
    await liteRTService.unloadModel();
    setIsLoaded(false);
    setActiveBackend(null);
    setResponse('');
    addLog('info', 'Model unloaded');
  };

  // ---------------------------------------------------------------------------
  // Log controls
  // ---------------------------------------------------------------------------

  const handleCopyLogs = () => {
    const text = logs.map(l => `[${l.time}][${l.level.toUpperCase()}] ${l.message}`).join('\n');
    Clipboard.setString(text);
    addLog('info', 'Logs copied to clipboard');
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>LiteRT Debug</Text>
        {activeBackend && (
          <View style={styles.backendBadge}>
            <Text style={styles.backendBadgeText}>{activeBackend.toUpperCase()}</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Model Path */}
        <View style={styles.section}>
          <Text style={styles.label}>Model path (.litertlm)</Text>
          <TextInput
            style={styles.input}
            value={modelPath}
            onChangeText={setModelPath}
            placeholder={DEFAULT_MODEL_PATH}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Push via ADB:{'\n'}
            adb push model.litertlm {RNFS.DocumentDirectoryPath}/models/model.litertlm
          </Text>
        </View>

        {/* Backend selector */}
        <View style={styles.section}>
          <Text style={styles.label}>Backend</Text>
          <View style={styles.segmented}>
            {(['cpu', 'gpu', 'npu'] as LiteRTBackend[]).map(b => (
              <TouchableOpacity
                key={b}
                style={[styles.segmentBtn, backend === b && styles.segmentBtnActive]}
                onPress={() => setBackend(b)}
              >
                <Text style={[styles.segmentText, backend === b && styles.segmentTextActive]}>
                  {b.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {backend === 'npu' && (
            <Text style={styles.hint}>NPU: Snapdragon 8 Gen 2+ only. Falls back to GPU then CPU.</Text>
          )}
        </View>

        {/* System prompt */}
        <View style={styles.section}>
          <Text style={styles.label}>System prompt</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            multiline
            numberOfLines={3}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {/* Load / Unload */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, (isLoading || isLoaded) && styles.btnDisabled]}
            onPress={handleLoad}
            disabled={isLoading || isLoaded}
          >
            <Text style={styles.btnText}>
              {isLoading ? 'Loading...' : isLoaded ? 'Loaded' : 'Load Model'}
            </Text>
          </TouchableOpacity>
          {isLoaded && (
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleUnload}>
              <Text style={styles.btnText}>Unload</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Message input + Send/Stop */}
        {isLoaded && (
          <View style={styles.section}>
            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={messageInput}
              onChangeText={setMessageInput}
              placeholder="Enter a message..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              editable={!isGenerating}
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, (isGenerating || !messageInput.trim()) && styles.btnDisabled]}
                onPress={handleSend}
                disabled={isGenerating || !messageInput.trim()}
              >
                <Text style={styles.btnText}>{isGenerating ? 'Generating...' : 'Send'}</Text>
              </TouchableOpacity>
              {isGenerating && (
                <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleStop}>
                  <Text style={styles.btnText}>Stop</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Response output */}
        {response.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Response</Text>
            <ScrollView
              ref={responseScrollRef}
              style={styles.responseBox}
              nestedScrollEnabled
            >
              <Text style={styles.responseText}>{response}</Text>
            </ScrollView>
          </View>
        )}

        {/* Logs */}
        <View style={styles.section}>
          <View style={styles.logsHeader}>
            <Text style={styles.label}>Logs ({logs.length})</Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={handleCopyLogs} style={styles.logBtn}>
                <Icon name="copy" size={14} color={colors.textMuted} />
                <Text style={styles.logBtnText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClearLogs} style={styles.logBtn}>
                <Icon name="trash-2" size={14} color={colors.textMuted} />
                <Text style={styles.logBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView
            ref={logsScrollRef}
            style={styles.logsBox}
            nestedScrollEnabled
          >
            {logs.length === 0 && (
              <Text style={styles.logsEmpty}>No logs yet. Load a model to start.</Text>
            )}
            {logs.map(entry => (
              <Text key={entry.id} style={[styles.logEntry, { color: logColor(entry.level, colors) }]}>
                {entry.time} {entry.message}
              </Text>
            ))}
          </ScrollView>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.small,
  },
  backBtn: { padding: SPACING.sm, marginRight: SPACING.sm },
  headerTitle: { ...TYPOGRAPHY.h3, color: colors.text, flex: 1 },
  backendBadge: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  backendBadgeText: { ...TYPOGRAPHY.meta, color: colors.background, fontWeight: '600' as const },
  scroll: { flex: 1 },
  section: { paddingHorizontal: SPACING.md, marginTop: SPACING.lg },
  label: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginBottom: SPACING.sm },
  hint: { ...TYPOGRAPHY.meta, color: colors.textMuted, marginTop: SPACING.sm, lineHeight: 16 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    color: colors.text,
  },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' as const },
  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: colors.surfaceLight ?? colors.surface,
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center' as const,
    borderRadius: 6,
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
  segmentTextActive: { color: colors.background, fontWeight: '600' as const },
  row: {
    flexDirection: 'row' as const,
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  btn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: colors.error ?? '#FF453A', flex: 0, paddingHorizontal: SPACING.xl },
  btnDisabled: { opacity: 0.4 },
  btnText: { ...TYPOGRAPHY.body, color: colors.background, fontWeight: '600' as const },
  responseBox: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACING.md,
    maxHeight: 240,
  },
  responseText: { ...TYPOGRAPHY.body, color: colors.text, lineHeight: 22 },
  logsHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: SPACING.sm,
  },
  logsBox: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACING.md,
    height: 260,
  },
  logsEmpty: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, fontStyle: 'italic' as const },
  logEntry: { ...TYPOGRAPHY.meta, lineHeight: 18, marginBottom: 2, fontFamily: 'Courier' },
  logBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  logBtnText: { ...TYPOGRAPHY.meta, color: colors.textMuted },
});
