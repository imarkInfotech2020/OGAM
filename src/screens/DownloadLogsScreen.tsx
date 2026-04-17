import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Share,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { getDownloadLogPath, readDownloadLogs, clearDownloadLogs } from '../services/downloadLogService';

export const DownloadLogsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [logText, setLogText] = useState('');
  const [logPath, setLogPath] = useState('');

  const loadLogs = useCallback(async () => {
    const [text, path] = await Promise.all([readDownloadLogs(), getDownloadLogPath()]);
    setLogText(text);
    setLogPath(path);
  }, []);

  useEffect(() => {
    loadLogs().catch(() => {});
  }, [loadLogs]);

  const handleCopy = async () => {
    Clipboard.setString(logText);
  };

  const handleShare = async () => {
    await Share.share({ message: logText || '(no logs yet)', title: 'Download Logs' });
  };

  const handleClear = async () => {
    await clearDownloadLogs();
    await loadLogs();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8, marginRight: 8 }}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Download Logs</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>{logPath}</Text>
        </View>
      </View>

      <View style={{
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <TouchableOpacity onPress={() => loadLogs()} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: `${colors.primary}18` }}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleCopy} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: `${colors.info}18` }}>
          <Text style={{ color: colors.info, fontWeight: '600' }}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: `${colors.success}18` }}>
          <Text style={{ color: colors.success, fontWeight: '600' }}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClear} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: `${colors.error}18` }}>
          <Text style={{ color: colors.error, fontWeight: '600' }}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <View style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: '#0B1220',
          padding: 14,
        }}>
          <Text selectable style={{ color: '#D6E2FF', fontFamily: 'Courier', fontSize: 12, lineHeight: 18 }}>
            {logText || 'No logs yet.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
