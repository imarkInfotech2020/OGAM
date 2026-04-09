/**
 * Kokoro voice definitions.
 *
 * Moved from constants/kokoroModels.ts into the engine boundary.
 * The VoiceConfig imports come from react-native-executorch; the
 * TTSVoice wrappers are engine-agnostic.
 */
import {
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
import type { TTSVoice } from '../../../types';

export type KokoroVoiceId =
  | 'af_heart'
  | 'af_river'
  | 'af_sarah'
  | 'am_adam'
  | 'am_michael'
  | 'am_santa'
  | 'bf_emma'
  | 'bm_daniel';

export interface KokoroVoiceEntry {
  id: KokoroVoiceId;
  label: string;
  persona: string;
  accent: string;
  gender: 'Female' | 'Male';
  defaultSpeed: number;
  config: VoiceConfig;
}

export const KOKORO_VOICES: KokoroVoiceEntry[] = [
  { id: 'af_heart',   label: 'Warm',      persona: 'Friendly and approachable',   accent: 'US',      gender: 'Female', defaultSpeed: 1.0, config: KOKORO_VOICE_AF_HEART },
  { id: 'af_river',   label: 'Calm',      persona: 'Relaxed and soothing',        accent: 'US',      gender: 'Female', defaultSpeed: 0.9, config: KOKORO_VOICE_AF_RIVER },
  { id: 'af_sarah',   label: 'Clear',     persona: 'Crisp and professional',      accent: 'US',      gender: 'Female', defaultSpeed: 1.0, config: KOKORO_VOICE_AF_SARAH },
  { id: 'am_adam',    label: 'Steady',    persona: 'Composed and reliable',       accent: 'US',      gender: 'Male',   defaultSpeed: 1.0, config: KOKORO_VOICE_AM_ADAM },
  { id: 'am_michael', label: 'Bold',      persona: 'Confident and direct',        accent: 'US',      gender: 'Male',   defaultSpeed: 1.1, config: KOKORO_VOICE_AM_MICHAEL },
  { id: 'am_santa',   label: 'Cheerful',  persona: 'Upbeat and energetic',        accent: 'US',      gender: 'Male',   defaultSpeed: 1.2, config: KOKORO_VOICE_AM_SANTA },
  { id: 'bf_emma',    label: 'Gentle',    persona: 'Soft and thoughtful',         accent: 'British', gender: 'Female', defaultSpeed: 0.9, config: KOKORO_VOICE_BF_EMMA },
  { id: 'bm_daniel',  label: 'Refined',   persona: 'Polished and articulate',     accent: 'British', gender: 'Male',   defaultSpeed: 1.0, config: KOKORO_VOICE_BM_DANIEL },
];

export const DEFAULT_KOKORO_VOICE_ID: KokoroVoiceId = 'af_heart';

export function getKokoroVoiceConfig(id: KokoroVoiceId): VoiceConfig {
  return KOKORO_VOICES.find(v => v.id === id)?.config ?? KOKORO_VOICE_AF_HEART;
}

/** Convert internal voice entries to engine-agnostic TTSVoice objects */
export function getKokoroTTSVoices(): TTSVoice[] {
  return KOKORO_VOICES.map(v => ({
    id: v.id,
    label: v.label,
    metadata: {
      accent: v.accent,
      gender: v.gender,
      persona: v.persona,
    },
  }));
}
