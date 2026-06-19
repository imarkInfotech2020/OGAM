/**
 * @deprecated — Use imports from 'src/engine' instead.
 * This file re-exports for backward compatibility with any remaining consumers.
 */
export {
  KOKORO_VOICES,
  DEFAULT_KOKORO_VOICE_ID,
  getKokoroVoiceConfig,
} from '../engine/tts/engines/kokoro/voices';
export type { KokoroVoiceId } from '../engine/tts/engines/kokoro/voices';
export { KOKORO_MEDIUM } from 'react-native-executorch';

import { Platform } from 'react-native';

/** @deprecated — Use engine.isSupported() instead */
export function isExecutorchSupported(): boolean {
  if (Platform.OS === 'android') {
    return (Platform.Version as number) >= 26;
  }
  if (Platform.OS === 'ios') {
    return parseInt(Platform.Version as string, 10) >= 17;
  }
  return false;
}
