// Stable local DeviceInfo for @offgrid/sync: a persisted device id (so a peer recognizes us across
// restarts), a human name, and the platform tag. Used by the Sync service + dev harness.
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { generateDeviceId } from '@offgrid/sync';
import type { DeviceInfo as SyncDeviceInfo } from '@offgrid/sync';
import { currentPlatform } from './nativeSync';

const DEVICE_ID_KEY = '@offgrid/sync/deviceId';
const DEVICE_NAME_KEY = '@offgrid/sync/deviceName';
const MAX_DEVICE_NAME_LENGTH = 64;

function validDeviceName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('Enter a device name.');
  if (name.length > MAX_DEVICE_NAME_LENGTH) {
    throw new Error(
      `Device names can be up to ${MAX_DEVICE_NAME_LENGTH} characters.`,
    );
  }
  return name;
}

export async function getOrCreateLocalDevice(): Promise<SyncDeviceInfo> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateDeviceId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  let name = await AsyncStorage.getItem(DEVICE_NAME_KEY);
  if (!name) {
    name = 'Off Grid Device';
    try {
      name = DeviceInfo.getDeviceNameSync() || name;
    } catch {
      /* name is best-effort */
    }
  }
  return {
    id,
    name,
    platform: currentPlatform(),
    version: '1',
    host: '',
    port: 0,
  };
}

export async function renameLocalDevice(nextName: string): Promise<string> {
  const name = validDeviceName(nextName);
  await AsyncStorage.setItem(DEVICE_NAME_KEY, name);
  return name;
}
