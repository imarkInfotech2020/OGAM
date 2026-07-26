// Stable local DeviceInfo for @offgrid/sync: a persisted device id (so a peer recognizes us across
// restarts), a human name, and the platform tag. Used by the Sync service + dev harness.
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { generateDeviceId } from '@offgrid/sync';
import type { DeviceInfo as SyncDeviceInfo } from '@offgrid/sync';
import { currentPlatform } from './nativeSync';

const DEVICE_ID_KEY = '@offgrid/sync/deviceId';

export async function getOrCreateLocalDevice(): Promise<SyncDeviceInfo> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateDeviceId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  let name = 'Off Grid Device';
  try {
    name = DeviceInfo.getDeviceNameSync() || name;
  } catch {
    /* name is best-effort */
  }
  return { id, name, platform: currentPlatform(), version: '1', host: '', port: 0 };
}
