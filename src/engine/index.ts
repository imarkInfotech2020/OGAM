/**
 * On-Device Engine SDK
 *
 * Public API surface. Everything exported here is part of the SDK contract.
 */

// ── Types ─────────────────────────────────────────────────────────────────
export type {
  // Base
  EnginePhase,
  ModelAsset,
  ModelAssetStatus,
  ModelAssetState,
  EngineCapabilities,
  BaseEngineEvents,
  OnDeviceEngine,
  // TTS
  TTSVoice,
  TTSEngineCapabilities,
  TTSSpeakOptions,
  TTSGenerateResult,
  TTSEngineEvents,
  TTSEngine,
} from './types';

// ── Classes ───────────────────────────────────────────────────────────────
export { OnDeviceEngineEmitter } from './OnDeviceEngineEmitter';
export { EngineRegistry } from './EngineRegistry';
export type { EngineFactory } from './EngineRegistry';

// ── TTS Engines ──────────────────────────────────────────────────────────
export { KokoroEngine } from './tts/engines/kokoro';
export { OuteTTSEngine } from './tts/engines/outetts';
export { Qwen3TTSEngine } from './tts/engines/qwen3';

// Re-export Kokoro voice types for settings UI
export { KOKORO_VOICES, DEFAULT_KOKORO_VOICE_ID } from './tts/engines/kokoro';
export type { KokoroVoiceId } from './tts/engines/kokoro';

// ── TTS Registry (singleton) ──────────────────────────────────────────────
import { EngineRegistry } from './EngineRegistry';
import type { TTSEngine } from './types';
import { KokoroEngine } from './tts/engines/kokoro';
import { OuteTTSEngine } from './tts/engines/outetts';
export const ttsRegistry = new EngineRegistry<TTSEngine>();

// Register built-in TTS engines
ttsRegistry.register('kokoro', () => new KokoroEngine());
ttsRegistry.register('outetts', () => new OuteTTSEngine());
// Qwen3-TTS stub — uncomment when inference pipeline is implemented:
// import { Qwen3TTSEngine } from './tts/engines/qwen3';
// ttsRegistry.register('qwen3-tts', () => new Qwen3TTSEngine());
