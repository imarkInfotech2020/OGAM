/**
 * Remote Server Configuration Modal
 *
 * Modal for adding and editing remote LLM server configurations.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { AppSheet } from '../AppSheet';
import { Button } from '../Button';
import { CustomAlert } from '../CustomAlert';
import { RemoteServer } from '../../types';
import { createStyles } from './styles';
import { useRemoteServerForm } from './useRemoteServerForm';

interface RemoteServerModalProps {
  visible: boolean;
  onClose: () => void;
  server?: RemoteServer; // For editing existing server
  onSave?: (server: RemoteServer) => void;
}

interface TestResultSectionProps {
  testResult: { success: boolean; message: string } | null;
  discoveredModels: Array<{ id: string; name: string }>;
  styles: ReturnType<typeof createStyles>;
}

const TestResultSection: React.FC<TestResultSectionProps> = ({ testResult, discoveredModels, styles }) => (
  <>
    {testResult && (
      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, testResult.success ? styles.statusDotSuccess : styles.statusDotError]} />
        <Text style={styles.statusText}>{testResult.message}</Text>
      </View>
    )}
    {discoveredModels.length > 0 && (
      <View style={styles.modelList}>
        <Text style={styles.sectionHeader}>Models found</Text>
        <ScrollView style={styles.modelScroll} nestedScrollEnabled>
          {discoveredModels.map((model) => (
            <View key={model.id} style={styles.modelItem}>
              <Text style={styles.modelName}>{model.name}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    )}
  </>
);

export const RemoteServerModal: React.FC<RemoteServerModalProps> = ({
  visible,
  onClose,
  server,
  onSave,
}) => {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  const [showApiKey, setShowApiKey] = useState(false);

  const {
    name, setName,
    endpoint, setEndpoint,
    apiKey, setApiKey,
    notes, setNotes,
    errors,
    isTesting,
    testResult,
    discoveredModels,
    handleTestConnection,
    handleSave,
    isPublicNetwork,
    alertState,
    dismissAlert,
  } = useRemoteServerForm({ server, visible, onSave, onClose });

  const handleDonePress = () => {
    if (testResult?.success) {
      handleSave();
      return;
    }
    onClose();
  };

  return (
    <AppSheet
      visible={visible}
      onClose={onClose}
      onHeaderClosePress={handleDonePress}
      title={server ? 'Edit server' : 'Add a server'}
      closeLabel="Done"
      snapPoints={['80%']}
      enableDynamicSizing
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.label}>Server name</Text>
        <TextInput
          style={[styles.input, errors.name && styles.inputError]}
          placeholder="e.g., Off Grid AI Desktop"
          placeholderTextColor={theme.colors.textMuted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

        <Text style={styles.label}>Address</Text>
        <TextInput
          style={[styles.input, errors.endpoint && styles.inputError]}
          placeholder="http://192.168.1.50:7878"
          placeholderTextColor={theme.colors.textMuted}
          value={endpoint}
          onChangeText={setEndpoint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {errors.endpoint && <Text style={styles.errorText}>{errors.endpoint}</Text>}
        {isPublicNetwork && (
          <View style={styles.warningContainer}>
            {/* An icon, not an emoji: emoji render per-platform and the design system bans them. */}
            <Icon
              name="alert-triangle"
              size={13}
              color={theme.colors.error}
              style={styles.warningIcon}
            />
            <Text style={styles.warningText}>
              This address is on the public internet. What you type here leaves your network and
              goes to whoever runs that server.
            </Text>
          </View>
        )}
        <Text style={styles.helperText}>
          {endpoint.trim()
            ? `Will connect to: ${endpoint.trim().replace(/\/+$/, '')}/v1/models`
            : 'Enter the base address. This app adds /v1/models to it.'}
        </Text>

        <Text style={styles.label}>API key (optional)</Text>
        <View style={styles.apiKeyContainer}>
          <TextInput
            style={[styles.input, styles.apiKeyInput]}
            placeholder="sk-..."
            placeholderTextColor={theme.colors.textMuted}
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showApiKey}
          />
          <TouchableOpacity style={styles.apiKeyToggle} onPress={() => setShowApiKey(v => !v)}>
            <Icon name={showApiKey ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.helperText}>
          Cloud services need this. A server on your own network does not.
        </Text>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="What this server is for"
          placeholderTextColor={theme.colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        <TestResultSection testResult={testResult} discoveredModels={discoveredModels} styles={styles} />
        {!testResult?.success && (
          <Text style={styles.helperText}>
            Test the connection first. That enables {server ? 'Update server' : 'Add server'}.
          </Text>
        )}

        {/* The app's own buttons, not two more hand-built pills. No `loading` prop: it swaps the
            label for the platform spinner, which reads as a retry arrow on Android. */}
        <View style={styles.buttonRow}>
          <Button
            title={isTesting ? 'Testing' : 'Test connection'}
            variant="secondary"
            onPress={handleTestConnection}
            disabled={isTesting}
            style={styles.buttonHalf}
            testID="test-connection"
          />
          <Button
            title={server ? 'Update server' : 'Add server'}
            onPress={handleSave}
            disabled={!testResult?.success}
            style={styles.buttonHalf}
            testID="save-server"
          />
        </View>
      </ScrollView>

      <CustomAlert {...alertState} onClose={dismissAlert} />
    </AppSheet>
  );
};
