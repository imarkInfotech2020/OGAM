import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../stores';

/**
 * Single navigation gate for the user-facing Sync control center.
 *
 * The restricted Sync bootstrap remains registered so an unlicensed installation can
 * receive Pro from an already licensed peer. Normal product entry points, however,
 * lead unlicensed users through the Pro surface first.
 */
export function useOpenSync(): {
  isSyncUnlocked: boolean;
  openSync: () => void;
  openSyncNotifications: () => void;
} {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isSyncUnlocked = useAppStore(
    state => state.isProActive || state.hasRegisteredPro,
  );
  const openSync = useCallback(() => {
    navigation.navigate(isSyncUnlocked ? 'Sync' : 'ProDetail');
  }, [isSyncUnlocked, navigation]);
  const openSyncNotifications = useCallback(() => {
    navigation.navigate(isSyncUnlocked ? 'Notifications' : 'ProDetail');
  }, [isSyncUnlocked, navigation]);

  return { isSyncUnlocked, openSync, openSyncNotifications };
}
