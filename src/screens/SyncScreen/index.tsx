import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useThemedStyles } from '../../theme';
import { useSyncStore } from '../../stores/syncStore';
import { syncService } from '../../services/sync/syncService';
import { createStyles } from './styles';
import type { DiscoveredDevice } from '@offgrid/sync';

export const SyncScreen: React.FC = () => {
  const navigation = useNavigation();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { status, error, thisDevice, discovered, paired, pairingCode, setPairingCode } = useSyncStore();
  const [pairingId, setPairingId] = useState<string | null>(null);

  // Start the engine when the screen opens; stop when it closes.
  useEffect(() => {
    syncService.start();
    return () => { syncService.stop(); };
  }, []);

  const handlePair = useCallback(async (device: DiscoveredDevice) => {
    if (!pairingCode.trim()) return;
    setPairingId(device.id);
    try {
      await syncService.pair(device, pairingCode.trim());
    } finally {
      setPairingId(null);
    }
  }, [pairingCode]);

  const statusLabel =
    status === 'running' ? 'Discoverable on your Wi-Fi'
    : status === 'starting' ? 'Starting…'
    : status === 'error' ? `Error: ${error ?? 'unknown'}`
    : 'Off';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="chevron-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Sync</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* This device + status */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>This device</Text>
            {status === 'starting' && <ActivityIndicator size="small" color={theme.colors.primary} />}
            {status === 'running' && <View style={styles.dotOn} />}
          </View>
          <Text style={styles.deviceName} testID="sync-this-device">{thisDevice?.name ?? '—'}</Text>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>

        {/* Shared pairing code */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pairing code</Text>
          <Text style={styles.hint}>Enter the SAME code on both devices, then tap a discovered device to pair.</Text>
          <TextInput
            testID="sync-pairing-code"
            style={styles.input}
            value={pairingCode}
            onChangeText={setPairingCode}
            placeholder="e.g. blue-otter-42"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Discovered devices */}
        <Text style={styles.sectionLabel}>DISCOVERED</Text>
        {discovered.length === 0 ? (
          <Text style={styles.empty} testID="sync-no-devices">No devices found yet. Open Sync on another device on the same Wi-Fi.</Text>
        ) : (
          discovered.map((d) => (
            <View key={d.id} style={styles.deviceRow} testID={`sync-discovered-${d.id}`}>
              <View style={styles.flex1}>
                <Text style={styles.deviceRowName}>{d.name}</Text>
                <Text style={styles.deviceRowSub}>{d.platform} · {d.host}</Text>
              </View>
              <TouchableOpacity
                style={[styles.pairButton, !pairingCode.trim() && styles.pairButtonDisabled]}
                disabled={!pairingCode.trim() || pairingId === d.id}
                onPress={() => handlePair(d)}
                testID={`sync-pair-${d.id}`}
              >
                {pairingId === d.id
                  ? <ActivityIndicator size="small" color={theme.colors.background} />
                  : <Text style={styles.pairButtonText}>Pair</Text>}
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Paired devices */}
        {paired.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>PAIRED</Text>
            {paired.map((d) => (
              <View key={d.id} style={styles.deviceRow} testID={`sync-paired-${d.id}`}>
                <Icon name="check-circle" size={18} color={theme.colors.primary} />
                <Text style={[styles.deviceRowName, styles.pairedName]}>{d.name ?? d.id}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
