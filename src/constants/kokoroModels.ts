import { Platform } from 'react-native';
import {
  KOKORO_MEDIUM,
  KOKORO_VOICE_AF_HEART,
  KOKORO_VOICE_AF_RIVER,
  KOKORO_VOICE_AF_SARAH,
  KOKORO_VOICE_AM_ADAM,
  KOKORO_VOICE_AM_MICHAEL,
  KOKORO_VOICE_AM_SANTA,
  KOKORO_VOICE_BF_EMMA,
  KOKORO_VOICE_BM_DANIEL,
} from 'react-native-executorch';
import type { VoiceConfig } from 'react-native-executorch';

export { KOKORO_MEDIUM };

export type KokoroVoiceId =
  | 'af_heart'
  | 'af_river'
  | 'af_sarah'
  | 'am_adam'
  | 'am_michael'
  | 'am_santa'
  | 'bf_emma'
  | 'bm_daniel';

export const KOKORO_VOICES: {
  id: KokoroVoiceId;
  label: string;
  accent: string;
  gender: 'Female' | 'Male';
  config: VoiceConfig;
}[] = [
  { id: 'af_heart',   label: 'Heart',   accent: 'US English',      gender: 'Female', config: KOKORO_VOICE_AF_HEART },
  { id: 'af_river',   label: 'River',   accent: 'US English',      gender: 'Female', config: KOKORO_VOICE_AF_RIVER },
  { id: 'af_sarah',   label: 'Sarah',   accent: 'US English',      gender: 'Female', config: KOKORO_VOICE_AF_SARAH },
  { id: 'am_adam',    label: 'Adam',    accent: 'US English',      gender: 'Male',   config: KOKORO_VOICE_AM_ADAM },
  { id: 'am_michael', label: 'Michael', accent: 'US English',      gender: 'Male',   config: KOKORO_VOICE_AM_MICHAEL },
  { id: 'am_santa',   label: 'Santa',   accent: 'US English',      gender: 'Male',   config: KOKORO_VOICE_AM_SANTA },
  { id: 'bf_emma',    label: 'Emma',    accent: 'British English',  gender: 'Female', config: KOKORO_VOICE_BF_EMMA },
  { id: 'bm_daniel',  label: 'Daniel',  accent: 'British English',  gender: 'Male',   config: KOKORO_VOICE_BM_DANIEL },
];

export const DEFAULT_KOKORO_VOICE_ID: KokoroVoiceId = 'af_heart';

export function getKokoroVoiceConfig(id: KokoroVoiceId): VoiceConfig {
  return KOKORO_VOICES.find(v => v.id === id)?.config ?? KOKORO_VOICE_AF_HEART;
}

/** Runtime check — executorch gradle.properties sets minSdkVersion=26; README says 33 but that's conservative */
export function isExecutorchSupported(): boolean {
  if (Platform.OS === 'android') {
    return (Platform.Version as number) >= 26;
  }
  if (Platform.OS === 'ios') {
    return parseInt(Platform.Version as string, 10) >= 17;
  }
  return false;
}
