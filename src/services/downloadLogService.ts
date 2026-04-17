import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import logger from '../utils/logger';

const { DownloadManagerModule } = NativeModules;

export async function getDownloadLogPath(): Promise<string> {
  if (DownloadManagerModule?.getDebugLogPath) {
    return DownloadManagerModule.getDebugLogPath();
  }
  return logger.getLogFilePath();
}

export async function readDownloadLogs(): Promise<string> {
  if (DownloadManagerModule?.readDebugLog) {
    return DownloadManagerModule.readDebugLog();
  }
  const path = await getDownloadLogPath();
  if (!(await RNFS.exists(path))) return '';
  return RNFS.readFile(path, 'utf8');
}

export async function clearDownloadLogs(): Promise<void> {
  if (DownloadManagerModule?.clearDebugLog) {
    await DownloadManagerModule.clearDebugLog();
    return;
  }
  const path = await getDownloadLogPath();
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path).catch(() => {});
  }
}
