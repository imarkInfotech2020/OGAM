# Text-to-Speech Implementation Plan

## Product Vision

Two first-class interface modes, switchable from Settings:

| Mode | Primary output | TTS role | Text |
|---|---|---|---|
| **Chat Mode** | Text bubbles | Add-on — play button per message | Default visible |
| **Audio Mode** | Waveform bubbles | Core — auto-generated at completion | Hidden by default, expandable |

**Audio Mode is the target product experience.** Messages feel like voice note exchanges — not a chat app that also speaks. The user has full per-message audio controls: scrub to position, adjust playback speed, change voice/tone. Text is always available as a "Show transcript" expand.

Chat Mode is the fallback for devices that can't run TTS models, or users who prefer it.

---

## Decision Log

### Engine
**OuteTTS 0.3 (500M) + WavTokenizer** via `llama.rn`.

- OuteTTS 1.0 (Qwen3 0.6B) is blocked: the DAC vocoder has no GGUF, and llama.cpp PR#12794 is an open draft. The backbone exists on HuggingFace but the decoder is not implemented upstream.
- OuteTTS 0.3 with WavTokenizer is the **only fully working path** through llama.rn today (confirmed via TTSScreen.tsx in mybigday/llama.rn example app).
- Upgrade to OuteTTS 1.0 will be a model swap with no architecture change once PR#12794 and llama.rn PR#300 land.

### Playback
**react-native-audio-api** (Software Mansion). Implements the Web Audio API spec for React Native. `decodeAudioTokens()` returns `number[]` (Float32 PCM at 24kHz mono) which feeds directly into an `AudioBuffer`.

### Audio Persistence (Audio Mode only)
In Audio Mode, generated PCM is written to disk as a WAV file per message so scrubbing works without re-generating. Files live at:

```
${RNFS.DocumentDirectoryPath}/audio-cache/{conversationId}/{messageId}.wav
```

Cache eviction strategy:
- Keep the last 50 messages worth of audio per conversation
- User can wipe audio cache from Settings ("Clear audio cache — X MB")
- Estimated size: ~1–4 MB per message (24kHz mono, varies by length)

In Chat Mode, audio is generated on demand, played, then discarded (no disk write).

### Voice Selection
OuteTTS 0.3 supports multiple speaker profiles. Expose as a voice picker in TTSSettingsScreen. Store selected voice ID in `ttsStore` settings (persisted). Default: speaker 0 (natural female).

### Device Gate
Require **flagship tier (8GB+ RAM)**. The memory stack:
```
LLM (3B Q4)       ~2.0 GB
Whisper base       ~150 MB
OuteTTS backbone   ~454 MB
WavTokenizer       ~ 73 MB
OS + app           ~2.0 GB
─────────────────────────
Total:             ~4.7 GB   → fits 8GB devices, tight on 6GB
```
Show a warning (not a hard block) for 6–8GB devices. Hard block below 6GB. If device is blocked, Audio Mode is unavailable — app defaults to Chat Mode and hides the Audio Mode option.

---

## Model Files

| Role | HuggingFace Repo | File | Size |
|---|---|---|---|
| TTS Backbone | `OuteAI/OuteTTS-0.3-500M-GGUF` | `OuteTTS-0.3-500M-Q4_K_M.gguf` | 454 MB |
| Vocoder | `ggml-org/WavTokenizer` | `WavTokenizer-Large-75-Q5_1.gguf` | 73 MB |

Direct download URLs (HuggingFace resolve):
```
https://huggingface.co/OuteAI/OuteTTS-0.3-500M-GGUF/resolve/main/OuteTTS-0.3-500M-Q4_K_M.gguf
https://huggingface.co/ggml-org/WavTokenizer/resolve/main/WavTokenizer-Large-75-Q5_1.gguf
```

Storage directories:
```
${RNFS.DocumentDirectoryPath}/tts-models/     ← model weights
${RNFS.DocumentDirectoryPath}/audio-cache/    ← per-message WAV files (Audio Mode only)
```

---

## New Package

```bash
npm install react-native-audio-api
```

iOS: run `pod install` after.
Android: auto-linked.

---

## Interface Mode Setting

### Where it lives
`ttsStore` settings object gains:

```typescript
export type InterfaceMode = 'chat' | 'audio';

export interface TTSSettings {
  interfaceMode: InterfaceMode; // default: 'chat' until TTS models downloaded, then user can switch
  enabled: boolean;
  autoPlay: boolean;            // Chat Mode only — auto-speak after completion
  speed: number;                // 0.5–2.0, default 1.0
  voiceId: string;              // OuteTTS speaker profile, default '0'
}
```

### Mode switching rules
- If TTS models not downloaded → `interfaceMode` locked to `'chat'`
- If device RAM < 6GB → `interfaceMode` locked to `'chat'`, Audio Mode option hidden
- Switching mode takes effect immediately for new messages; existing messages render in whatever mode they were generated in (Chat Mode messages have no audio file, Audio Mode messages have one)
- A banner appears at the top of the chat on first switch: "Audio mode on — responses will play as voice notes."

---

## Audio Mode: Message Bubble

### Layout (replaces text bubble for assistant messages)

```
┌─────────────────────────────────────────────┐
│  [avatar]  ●━━━━━━━━━━━━━━━━━━━  0:42  1x  │
│            [waveform visualization]          │
│            [Show transcript ▾]               │
└─────────────────────────────────────────────┘
```

- **Waveform bar** — static amplitude visualization drawn from PCM data at generation time (no real-time animation needed, just a static shape like WhatsApp)
- **Scrubber** — draggable progress indicator
- **Timestamp** — elapsed / total duration
- **Speed chip** — tappable, cycles 0.5x → 1x → 1.5x → 2x
- **Show transcript** — expands inline to full text, collapses again

User messages (voice input via Whisper) show the same bubble layout but with the transcript as primary since we have no TTS for user messages.

### Per-message controls (long press → action sheet)
- Change voice (re-generates audio with new speaker profile, overwrites cached file)
- Regenerate audio
- Copy text
- Delete message

---

## Files to Create

### 1. `src/constants/ttsModels.ts`

```typescript
export const TTS_BACKBONE_MODEL = {
  id: 'outetts-0.3-500m-q4',
  name: 'OuteTTS 0.3',
  backboneFile: 'OuteTTS-0.3-500M-Q4_K_M.gguf',
  backboneUrl: 'https://huggingface.co/OuteAI/OuteTTS-0.3-500M-GGUF/resolve/main/OuteTTS-0.3-500M-Q4_K_M.gguf',
  backboneSizeMB: 454,
  vocoderFile: 'WavTokenizer-Large-75-Q5_1.gguf',
  vocoderUrl: 'https://huggingface.co/ggml-org/WavTokenizer/resolve/main/WavTokenizer-Large-75-Q5_1.gguf',
  vocoderSizeMB: 73,
  sampleRate: 24000,
  description: 'Natural-sounding on-device speech. Requires ~530 MB storage.',
};

export const TTS_SPEAKER_PROFILES = [
  { id: '0', label: 'Default' },
  // Add more as OuteTTS 0.3 speaker profiles are confirmed
];

export const TTS_MIN_RAM_GB = 6;   // warn below 8, hard block below 6
export const TTS_BLOCK_RAM_GB = 6; // hard block
export const TTS_WARN_RAM_GB = 8;  // show warning card
export const AUDIO_CACHE_MAX_MESSAGES = 50; // per conversation
```

---

### 2. `src/services/ttsService.ts`

Mirror `whisperService.ts` pattern exactly.

```typescript
import { initLlama, LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import { AudioContext } from 'react-native-audio-api';
import logger from '../utils/logger';
import { TTS_BACKBONE_MODEL } from '../constants/ttsModels';

export interface TTSOptions {
  speed?: number;    // 0.5–2.0, default 1.0
  voiceId?: string;  // speaker profile id, default '0'
}

export interface GeneratedAudio {
  samples: Float32Array;
  durationSeconds: number;
  sampleRate: number;
  /** Amplitude envelope (downsampled to ~200 points) for waveform visualization */
  waveformData: number[];
}

class TTSService {
  private context: LlamaContext | null = null;
  private isVocoderReady: boolean = false;
  private isSpeakingFlag: boolean = false;
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private contextLoadPromise: Promise<void> = Promise.resolve();

  // ─── Directories & Paths ────────────────────────────────────────────────

  getModelsDir(): string {
    return `${RNFS.DocumentDirectoryPath}/tts-models`;
  }

  getAudioCacheDir(conversationId: string): string {
    return `${RNFS.DocumentDirectoryPath}/audio-cache/${conversationId}`;
  }

  getAudioFilePath(conversationId: string, messageId: string): string {
    return `${this.getAudioCacheDir(conversationId)}/${messageId}.wav`;
  }

  async ensureModelsDirExists(): Promise<void> {
    const dir = this.getModelsDir();
    if (!await RNFS.exists(dir)) await RNFS.mkdir(dir);
  }

  async ensureAudioCacheDirExists(conversationId: string): Promise<void> {
    const dir = this.getAudioCacheDir(conversationId);
    if (!await RNFS.exists(dir)) await RNFS.mkdir(dir);
  }

  getBackbonePath(): string {
    return `${this.getModelsDir()}/${TTS_BACKBONE_MODEL.backboneFile}`;
  }

  getVocoderPath(): string {
    return `${this.getModelsDir()}/${TTS_BACKBONE_MODEL.vocoderFile}`;
  }

  async isBackboneDownloaded(): Promise<boolean> {
    return RNFS.exists(this.getBackbonePath());
  }

  async isVocoderDownloaded(): Promise<boolean> {
    return RNFS.exists(this.getVocoderPath());
  }

  async areBothModelsDownloaded(): Promise<boolean> {
    return (await this.isBackboneDownloaded()) && (await this.isVocoderDownloaded());
  }

  async isAudioCached(conversationId: string, messageId: string): Promise<boolean> {
    return RNFS.exists(this.getAudioFilePath(conversationId, messageId));
  }

  async getAudioCacheSizeMB(): Promise<number> {
    const cacheRoot = `${RNFS.DocumentDirectoryPath}/audio-cache`;
    if (!await RNFS.exists(cacheRoot)) return 0;
    const stat = await RNFS.stat(cacheRoot);
    return stat.size / (1024 * 1024);
  }

  async clearAudioCache(): Promise<void> {
    const cacheRoot = `${RNFS.DocumentDirectoryPath}/audio-cache`;
    if (await RNFS.exists(cacheRoot)) await RNFS.unlink(cacheRoot);
  }

  // ─── Download ────────────────────────────────────────────────────────────

  async downloadBackbone(onProgress?: (p: number) => void): Promise<string> {
    await this.ensureModelsDirExists();
    const dest = this.getBackbonePath();
    if (await RNFS.exists(dest)) return dest;
    const dl = RNFS.downloadFile({
      fromUrl: TTS_BACKBONE_MODEL.backboneUrl,
      toFile: dest,
      progressDivider: 1,
      progress: (res) => onProgress?.(res.bytesWritten / res.contentLength),
    });
    const result = await dl.promise;
    if (result.statusCode !== 200) {
      await RNFS.unlink(dest).catch(() => {});
      throw new Error(`Backbone download failed: HTTP ${result.statusCode}`);
    }
    return dest;
  }

  async downloadVocoder(onProgress?: (p: number) => void): Promise<string> {
    await this.ensureModelsDirExists();
    const dest = this.getVocoderPath();
    if (await RNFS.exists(dest)) return dest;
    const dl = RNFS.downloadFile({
      fromUrl: TTS_BACKBONE_MODEL.vocoderUrl,
      toFile: dest,
      progressDivider: 1,
      progress: (res) => onProgress?.(res.bytesWritten / res.contentLength),
    });
    const result = await dl.promise;
    if (result.statusCode !== 200) {
      await RNFS.unlink(dest).catch(() => {});
      throw new Error(`Vocoder download failed: HTTP ${result.statusCode}`);
    }
    return dest;
  }

  async deleteModels(): Promise<void> {
    await this.unloadModels();
    const bp = this.getBackbonePath();
    const vp = this.getVocoderPath();
    if (await RNFS.exists(bp)) await RNFS.unlink(bp);
    if (await RNFS.exists(vp)) await RNFS.unlink(vp);
  }

  // ─── Model Lifecycle ─────────────────────────────────────────────────────

  async loadModels(): Promise<void> {
    if (this.context && this.isVocoderReady) return;

    this.contextLoadPromise = this.contextLoadPromise.then(async () => {
      if (this.context && this.isVocoderReady) return;

      logger.log('[TTS] Loading backbone...');
      this.context = await initLlama({
        model: this.getBackbonePath(),
        n_ctx: 8192,
        n_threads: 4,
      });

      logger.log('[TTS] Loading vocoder...');
      await this.context.initVocoder({
        path: this.getVocoderPath(),
        n_batch: 4096,
      });

      this.isVocoderReady = await this.context.isVocoderEnabled();
      if (!this.isVocoderReady) {
        throw new Error('Vocoder failed to initialize — check model files.');
      }

      logger.log('[TTS] Ready.');
    });

    return this.contextLoadPromise;
  }

  async unloadModels(): Promise<void> {
    this.stop();
    if (this.context) {
      await this.context.releaseVocoder().catch(() => {});
      await this.context.release().catch(() => {});
      this.context = null;
    }
    this.isVocoderReady = false;
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
  }

  isLoaded(): boolean {
    return this.context !== null && this.isVocoderReady;
  }

  // ─── Audio Generation ────────────────────────────────────────────────────

  /**
   * Generate PCM audio for `text`. Does NOT play it.
   * Returns samples + metadata needed for waveform rendering and playback.
   */
  async generate(text: string, options: TTSOptions = {}): Promise<GeneratedAudio> {
    if (!this.context || !this.isVocoderReady) {
      throw new Error('TTS models not loaded.');
    }

    const speakerId = options.voiceId ?? '0';
    const { prompt, grammar } = await this.context.getFormattedAudioCompletion(
      speakerId === '0' ? null : speakerId,
      text,
    );
    const guideTokens = await this.context.getAudioCompletionGuideTokens(text);

    const result = await this.context.completion({
      prompt,
      grammar,
      guide_tokens: guideTokens,
      n_predict: 4096,
      temperature: 0.7,
      top_p: 0.9,
      stop: ['<|im_end|>'],
    });

    const pcmArray = await this.context.decodeAudioTokens(result.audio_tokens);
    const samples = new Float32Array(pcmArray);
    const sampleRate = TTS_BACKBONE_MODEL.sampleRate;
    const durationSeconds = samples.length / sampleRate;
    const waveformData = this.downsampleForWaveform(samples, 200);

    return { samples, durationSeconds, sampleRate, waveformData };
  }

  /**
   * Write PCM samples to a WAV file on disk.
   * Used in Audio Mode to persist audio per message.
   */
  async saveToFile(audio: GeneratedAudio, conversationId: string, messageId: string): Promise<string> {
    await this.ensureAudioCacheDirExists(conversationId);
    const path = this.getAudioFilePath(conversationId, messageId);
    const wavBuffer = this.encodeWAV(audio.samples, audio.sampleRate);
    await RNFS.writeFile(path, wavBuffer, 'base64');
    return path;
  }

  /**
   * Generate + save in one step (Audio Mode convenience).
   */
  async generateAndSave(
    text: string,
    conversationId: string,
    messageId: string,
    options: TTSOptions = {},
  ): Promise<{ path: string; audio: GeneratedAudio }> {
    const audio = await this.generate(text, options);
    const path = await this.saveToFile(audio, conversationId, messageId);
    return { path, audio };
  }

  // ─── Playback ────────────────────────────────────────────────────────────

  async playFromSamples(samples: Float32Array, speed: number = 1.0, startOffset: number = 0): Promise<void> {
    const sampleRate = TTS_BACKBONE_MODEL.sampleRate;

    this.audioCtx?.close().catch(() => {});
    this.audioCtx = new AudioContext({ sampleRate });

    const buffer = this.audioCtx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speed;
    source.connect(this.audioCtx.destination);

    this.currentSource = source;
    this.isSpeakingFlag = true;

    return new Promise((resolve) => {
      source.onended = () => {
        this.currentSource = null;
        this.isSpeakingFlag = false;
        resolve();
      };
      source.start(0, startOffset);
    });
  }

  async playFromFile(filePath: string, speed: number = 1.0, startOffset: number = 0): Promise<void> {
    const base64 = await RNFS.readFile(filePath, 'base64');
    const samples = this.decodeWAV(base64);
    return this.playFromSamples(samples, speed, startOffset);
  }

  /**
   * Chat Mode convenience: generate + play + discard (no disk write).
   */
  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (this.isSpeakingFlag) this.stop();
    const audio = await this.generate(text, options);
    if (!this.isSpeakingFlag) { // may have been stopped during generation
      await this.playFromSamples(audio.samples, options.speed ?? 1.0);
    }
  }

  stop(): void {
    this.isSpeakingFlag = false;
    try {
      this.currentSource?.stop();
    } catch {
      // already stopped
    }
    this.currentSource = null;
  }

  isSpeaking(): boolean {
    return this.isSpeakingFlag;
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  private downsampleForWaveform(samples: Float32Array, points: number): number[] {
    const blockSize = Math.floor(samples.length / points);
    const result: number[] = [];
    for (let i = 0; i < points; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(samples[i * blockSize + j]);
      }
      result.push(sum / blockSize);
    }
    return result;
  }

  private encodeWAV(samples: Float32Array, sampleRate: number): string {
    // Standard 16-bit PCM WAV encoding → base64
    // Implementation: write RIFF header + PCM data
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, samples[i] * 32768)), true);
    }
    return Buffer.from(buffer).toString('base64');
  }

  private decodeWAV(base64: string): Float32Array {
    const buffer = Buffer.from(base64, 'base64');
    const view = new DataView(buffer.buffer);
    const sampleCount = (buffer.length - 44) / 2;
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = view.getInt16(44 + i * 2, true) / 32768;
    }
    return samples;
  }
}

export const ttsService = new TTSService();
```

---

### 3. `src/stores/ttsStore.ts`

Mirror `whisperStore.ts` pattern, using Zustand with `persist`.

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ttsService } from '../services/ttsService';
import logger from '../utils/logger';

export type InterfaceMode = 'chat' | 'audio';

export interface TTSSettings {
  interfaceMode: InterfaceMode;
  enabled: boolean;
  autoPlay: boolean;     // Chat Mode only
  speed: number;         // 0.5–2.0
  voiceId: string;       // OuteTTS speaker profile
}

export interface TTSState {
  // Download state
  isBackboneDownloaded: boolean;
  isVocoderDownloaded: boolean;
  isDownloadingBackbone: boolean;
  isDownloadingVocoder: boolean;
  backboneDownloadProgress: number;
  vocoderDownloadProgress: number;

  // Model lifecycle
  isModelLoading: boolean;
  isModelLoaded: boolean;

  // Playback
  isSpeaking: boolean;
  currentMessageId: string | null;
  playbackPosition: number;  // seconds, for scrubber

  // Cache
  audioCacheSizeMB: number;

  // Settings (persisted)
  settings: TTSSettings;

  error: string | null;

  // Actions
  checkDownloadStatus: () => Promise<void>;
  downloadModels: () => Promise<void>;
  deleteModels: () => Promise<void>;
  loadModels: () => Promise<void>;
  unloadModels: () => Promise<void>;

  // Chat Mode
  speak: (text: string, messageId: string) => Promise<void>;
  stop: () => void;

  // Audio Mode
  generateAndSave: (text: string, conversationId: string, messageId: string) => Promise<{ path: string; waveformData: number[]; durationSeconds: number }>;
  playMessage: (messageId: string, filePath: string, startOffset?: number) => Promise<void>;
  stopPlayback: () => void;

  // Cache management
  refreshCacheSize: () => Promise<void>;
  clearAudioCache: () => Promise<void>;

  updateSettings: (patch: Partial<TTSSettings>) => void;
  clearError: () => void;
}

export const useTTSStore = create<TTSState>()(
  persist(
    (set, get) => ({
      isBackboneDownloaded: false,
      isVocoderDownloaded: false,
      isDownloadingBackbone: false,
      isDownloadingVocoder: false,
      backboneDownloadProgress: 0,
      vocoderDownloadProgress: 0,
      isModelLoading: false,
      isModelLoaded: false,
      isSpeaking: false,
      currentMessageId: null,
      playbackPosition: 0,
      audioCacheSizeMB: 0,
      settings: {
        interfaceMode: 'chat',
        enabled: true,
        autoPlay: false,
        speed: 1.0,
        voiceId: '0',
      },
      error: null,

      checkDownloadStatus: async () => {
        const [backbone, vocoder] = await Promise.all([
          ttsService.isBackboneDownloaded(),
          ttsService.isVocoderDownloaded(),
        ]);
        set({ isBackboneDownloaded: backbone, isVocoderDownloaded: vocoder });
      },

      downloadModels: async () => {
        set({ error: null });
        try {
          set({ isDownloadingBackbone: true, backboneDownloadProgress: 0 });
          await ttsService.downloadBackbone((p) => set({ backboneDownloadProgress: p }));
          set({ isDownloadingBackbone: false, isBackboneDownloaded: true });

          set({ isDownloadingVocoder: true, vocoderDownloadProgress: 0 });
          await ttsService.downloadVocoder((p) => set({ vocoderDownloadProgress: p }));
          set({ isDownloadingVocoder: false, isVocoderDownloaded: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Download failed';
          logger.error('[TTS Store] Download error:', msg);
          set({ isDownloadingBackbone: false, isDownloadingVocoder: false, error: msg });
        }
      },

      deleteModels: async () => {
        await ttsService.deleteModels();
        set({ isBackboneDownloaded: false, isVocoderDownloaded: false, isModelLoaded: false });
      },

      loadModels: async () => {
        if (get().isModelLoaded || get().isModelLoading) return;
        set({ isModelLoading: true, error: null });
        try {
          await ttsService.loadModels();
          set({ isModelLoaded: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to load TTS models';
          logger.error('[TTS Store] Load error:', msg);
          set({ error: msg });
        } finally {
          set({ isModelLoading: false });
        }
      },

      unloadModels: async () => {
        await ttsService.unloadModels();
        set({ isModelLoaded: false, isSpeaking: false, currentMessageId: null });
      },

      // ── Chat Mode ──────────────────────────────────────────────────────────

      speak: async (text: string, messageId: string) => {
        const { isModelLoaded, settings } = get();
        if (!settings.enabled) return;
        if (!isModelLoaded) return;

        if (get().currentMessageId === messageId && get().isSpeaking) {
          get().stop();
          return;
        }

        ttsService.stop();
        set({ isSpeaking: true, currentMessageId: messageId, error: null });

        try {
          await ttsService.speak(text, { speed: settings.speed, voiceId: settings.voiceId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Speech failed';
          logger.error('[TTS Store] Speak error:', msg);
          set({ error: msg });
        } finally {
          set({ isSpeaking: false, currentMessageId: null });
        }
      },

      stop: () => {
        ttsService.stop();
        set({ isSpeaking: false, currentMessageId: null });
      },

      // ── Audio Mode ─────────────────────────────────────────────────────────

      generateAndSave: async (text: string, conversationId: string, messageId: string) => {
        const { settings } = get();
        const { path, audio } = await ttsService.generateAndSave(
          text,
          conversationId,
          messageId,
          { voiceId: settings.voiceId },
        );
        await get().refreshCacheSize();
        return { path, waveformData: audio.waveformData, durationSeconds: audio.durationSeconds };
      },

      playMessage: async (messageId: string, filePath: string, startOffset: number = 0) => {
        const { settings } = get();

        if (get().currentMessageId === messageId && get().isSpeaking) {
          get().stopPlayback();
          return;
        }

        ttsService.stop();
        set({ isSpeaking: true, currentMessageId: messageId, playbackPosition: startOffset });

        try {
          await ttsService.playFromFile(filePath, settings.speed, startOffset);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Playback failed';
          logger.error('[TTS Store] Playback error:', msg);
          set({ error: msg });
        } finally {
          set({ isSpeaking: false, currentMessageId: null, playbackPosition: 0 });
        }
      },

      stopPlayback: () => {
        ttsService.stop();
        set({ isSpeaking: false, currentMessageId: null, playbackPosition: 0 });
      },

      // ── Cache ──────────────────────────────────────────────────────────────

      refreshCacheSize: async () => {
        const mb = await ttsService.getAudioCacheSizeMB();
        set({ audioCacheSizeMB: mb });
      },

      clearAudioCache: async () => {
        await ttsService.clearAudioCache();
        set({ audioCacheSizeMB: 0 });
      },

      updateSettings: (patch) => {
        set((state) => ({ settings: { ...state.settings, ...patch } }));
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'tts-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
```

---

### 4. `src/hooks/useTTS.ts`

```typescript
import { useEffect, useCallback } from 'react';
import { useTTSStore } from '../stores/ttsStore';
import { hardwareService } from '../services/hardware';
import { TTS_BLOCK_RAM_GB, TTS_WARN_RAM_GB } from '../constants/ttsModels';

export function useTTS() {
  const store = useTTSStore();

  useEffect(() => {
    store.checkDownloadStatus();
  }, []);

  const canRunOnDevice = useCallback(async (): Promise<{ allowed: boolean; warning: boolean }> => {
    const ramGB = await hardwareService.getTotalMemoryGB();
    return {
      allowed: ramGB >= TTS_BLOCK_RAM_GB,
      warning: ramGB < TTS_WARN_RAM_GB,
    };
  }, []);

  const speakMessage = useCallback(
    (text: string, messageId: string) => {
      if (!store.isModelLoaded && store.isBackboneDownloaded && store.isVocoderDownloaded) {
        store.loadModels().then(() => store.speak(text, messageId));
        return;
      }
      store.speak(text, messageId);
    },
    [store]
  );

  return {
    ...store,
    speakMessage,
    canRunOnDevice,
    areBothDownloaded: store.isBackboneDownloaded && store.isVocoderDownloaded,
    isDownloading: store.isDownloadingBackbone || store.isDownloadingVocoder,
    overallDownloadProgress:
      store.backboneDownloadProgress * 0.86 + store.vocoderDownloadProgress * 0.14,
    isAudioMode: store.settings.interfaceMode === 'audio',
    isChatMode: store.settings.interfaceMode === 'chat',
  };
}
```

---

### 5. `src/components/AudioMessageBubble/index.tsx` *(Audio Mode only)*

Replaces `ChatMessage` assistant bubble when `interfaceMode === 'audio'`.

```typescript
interface AudioMessageBubbleProps {
  messageId: string;
  conversationId: string;
  audioPath: string;          // path to WAV on disk
  waveformData: number[];     // 200-point amplitude array
  durationSeconds: number;
  isGenerating?: boolean;     // true while TTS is still running
}
```

**Layout:**
- Static waveform bar (200 rect bars, amplitude-scaled, filled up to scrubber position)
- Draggable scrubber thumb
- `MM:SS` elapsed / total
- Speed chip (cycles 0.5x → 1x → 1.5x → 2x, persists to store)
- "Show transcript" collapse/expand
- Long press → action sheet (Change voice, Regenerate, Copy text, Delete)

---

### 6. `src/components/TTSButton/index.tsx` *(Chat Mode only)*

Play/stop button that appears on each assistant message bubble. Unchanged from original plan — only rendered when `interfaceMode === 'chat'`.

```typescript
// Don't render in Audio Mode or if TTS disabled/not downloaded
if (settings.interfaceMode === 'audio' || !settings.enabled || !areBothDownloaded) return null;
```

---

### 7. `src/screens/TTSSettingsScreen/index.tsx`

Accessible from SettingsScreen → "Text to Speech" row.

**Sections:**
1. **Header** — back button + "Text to Speech" title
2. **Interface Mode card** — segmented control: `Chat` / `Audio`
   - If device RAM < `TTS_BLOCK_RAM_GB`: Audio option is greyed out with "Requires 6GB+ RAM"
   - If RAM is between block and warn thresholds: yellow warning under the control
3. **Master toggle card** — enable/disable TTS (Chat Mode only — in Audio Mode, TTS is always on)
4. **Model download card** — download status for both files with separate progress bars; "Download (527 MB)" / "Remove" buttons
5. **Voice card** (shown when downloaded) — voice picker from `TTS_SPEAKER_PROFILES`
6. **Playback card** (shown when downloaded) — Speed slider (0.5–2.0x), Auto-play toggle (Chat Mode only)
7. **Audio cache card** (Audio Mode only) — "Audio cache: X MB" + "Clear cache" button
8. **Device compatibility card** — RAM check with status
9. **Privacy card** — "All speech generated on your device. Nothing is sent to any server."

---

### 8. `src/stores/index.ts`

Add:
```typescript
export { useTTSStore } from './ttsStore';
```

### 9. `src/services/index.ts`

Add:
```typescript
export { ttsService } from './ttsService';
```

### 10. `src/navigation/types.ts`

Add `TTSSettings: undefined` to `RootStackParamList`.

### 11. `src/navigation/AppNavigator.tsx`

```tsx
<RootStack.Screen name="TTSSettings" component={TTSSettingsScreen} options={{ headerShown: false }} />
```

### 12. `src/screens/index.ts`

Export `TTSSettingsScreen` and `AudioMessageBubble`.

### 13. `src/screens/SettingsScreen.tsx`

Add nav row pointing to `TTSSettings` (after the Voice row):
```tsx
<TouchableOpacity onPress={() => navigation.navigate('TTSSettings')}>
  <Icon name="volume-2" />
  <Text>Text to Speech</Text>
  <Icon name="chevron-right" />
</TouchableOpacity>
```

### 14. `src/components/ChatMessage/index.tsx`

Mode-branch the assistant message render path:

```tsx
import { AudioMessageBubble } from '../AudioMessageBubble';
import { TTSButton } from '../TTSButton';

// In assistant message render:
const { settings } = useTTSStore();

if (settings.interfaceMode === 'audio' && message.audioPath) {
  return (
    <AudioMessageBubble
      messageId={message.id}
      conversationId={conversationId}
      audioPath={message.audioPath}
      waveformData={message.waveformData ?? []}
      durationSeconds={message.audioDurationSeconds ?? 0}
      isGenerating={message.isGeneratingAudio}
    />
  );
}

// Chat Mode: existing text bubble + TTSButton
```

This requires adding `audioPath`, `waveformData`, `audioDurationSeconds`, and `isGeneratingAudio` fields to the message model.

### 15. Message model update (`src/types/` or wherever `Message` is defined)

```typescript
export interface Message {
  // ... existing fields ...
  audioPath?: string;              // Audio Mode: path to WAV on disk
  waveformData?: number[];         // Audio Mode: 200-point amplitude envelope
  audioDurationSeconds?: number;   // Audio Mode: total duration
  isGeneratingAudio?: boolean;     // true while TTS is running for this message
}
```

### 16. Chat completion flow

**Chat Mode (autoPlay):** unchanged from original plan — call `speak()` after streaming completes when `autoPlay: true`.

**Audio Mode:** after streaming completes, immediately trigger `generateAndSave()` and update the message record with the returned `audioPath`, `waveformData`, `durationSeconds`. Set `isGeneratingAudio: true` on the message while generation runs so the bubble shows a loading state.

```typescript
// After streaming completes, if Audio Mode:
if (settings.interfaceMode === 'audio') {
  updateMessage(lastMessage.id, { isGeneratingAudio: true });
  const { path, waveformData, durationSeconds } = await ttsStore.generateAndSave(
    stripControlTokens(lastMessage.content),
    conversationId,
    lastMessage.id,
  );
  updateMessage(lastMessage.id, {
    audioPath: path,
    waveformData,
    audioDurationSeconds: durationSeconds,
    isGeneratingAudio: false,
  });
}
```

---

## Tests to Write

### `__tests__/unit/services/ttsService.test.ts`
- `generate` calls `getFormattedAudioCompletion`, `getAudioCompletionGuideTokens`, `completion`, `decodeAudioTokens` in order
- `generate` returns correct `durationSeconds` and 200-point `waveformData`
- `saveToFile` writes a valid WAV file to the correct path
- `generateAndSave` calls both and returns path + audio
- `playFromFile` reads WAV, decodes, and calls `playFromSamples`
- `stop` sets `isSpeakingFlag` to false and calls `currentSource.stop()`
- `encodeWAV` / `decodeWAV` round-trip preserves samples (within 16-bit quantization error)
- `getAudioCacheSizeMB` returns correct value
- `clearAudioCache` removes the cache directory

### `__tests__/unit/stores/ttsStore.test.ts`
- `generateAndSave` sets correct waveformData and calls `refreshCacheSize`
- `playMessage` sets `isSpeaking: true`, then `false` after completion
- `playMessage` on same messageId while playing → calls `stopPlayback`
- `updateSettings` merges partial settings correctly
- Settings persisted: `interfaceMode`, `speed`, `voiceId`, `enabled` survive re-hydration

### `__tests__/integration/tts.test.ts`
- **Chat Mode full flow:** download → load → speak → stop
- **Audio Mode full flow:** download → load → generateAndSave → playMessage → stop
- **Auto-play:** Chat Mode with `autoPlay: true`, streaming completes → `speak` called
- **Audio Mode post-completion:** streaming completes → `generateAndSave` called → message updated with `audioPath`
- **Mode switch:** switching `interfaceMode` from `'chat'` to `'audio'` takes effect for next message

---

## Implementation Order

1. `src/constants/ttsModels.ts`
2. `src/services/ttsService.ts` (with WAV encode/decode + `generate`/`generateAndSave`/`playFromFile`)
3. `src/stores/ttsStore.ts` (with Audio Mode actions)
4. `src/hooks/useTTS.ts`
5. `src/stores/index.ts` — add export
6. `src/services/index.ts` — add export
7. `src/navigation/types.ts` — add route
8. Message model — add `audioPath`, `waveformData`, `audioDurationSeconds`, `isGeneratingAudio`
9. `src/components/AudioMessageBubble/index.tsx`
10. `src/components/TTSButton/index.tsx` (Chat Mode only, unchanged)
11. `src/screens/TTSSettingsScreen/index.tsx` (with Interface Mode section)
12. `src/screens/index.ts` — add exports
13. `src/navigation/AppNavigator.tsx` — add screen
14. `src/screens/SettingsScreen.tsx` — add nav row
15. `src/components/ChatMessage/index.tsx` — mode-branch render
16. Wire Audio Mode generation into chat completion flow
17. Write all tests
18. `npm install react-native-audio-api` + `pod install`

---

## Memory Safety

Before calling `loadModels()`, check available memory:

```typescript
const available = await hardwareService.getAvailableMemoryGB();
if (available < 1.0) {
  throw new Error('Not enough free memory. Try closing image generation first.');
}
```

This check belongs in `useTTSStore.loadModels()` before calling `ttsService.loadModels()`.

---

## Future: Upgrade to OuteTTS 1.0

When llama.cpp PR#12794 (DAC decoder) merges and llama.rn PR#300 (codec.cpp integration) ships:

1. Add `TTS_BACKBONE_MODEL_V2` to `ttsModels.ts` (backbone + DAC vocoder GGUF)
2. `ttsService.ts` API is unchanged — model-agnostic
3. Store gets a `modelVersion` setting; 0.3 and 1.0 can coexist on disk
