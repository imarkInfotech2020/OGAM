# Text-to-Speech Implementation Plan

## Decision Log

### Engine
**OuteTTS 0.3 (500M) + WavTokenizer** via `llama.rn`.

- OuteTTS 1.0 (Qwen3 0.6B) is blocked: the DAC vocoder has no GGUF, and llama.cpp PR#12794 is an open draft. The backbone exists on HuggingFace but the decoder is not implemented upstream.
- OuteTTS 0.3 with WavTokenizer is the **only fully working path** through llama.rn today (confirmed via TTSScreen.tsx in mybigday/llama.rn example app).
- Upgrade to OuteTTS 1.0 will be a model swap with no architecture change once PR#12794 and llama.rn PR#300 land.

### Playback
**react-native-audio-api** (Software Mansion). This is the exact library used in the official llama.rn TTS example. It implements the Web Audio API spec for React Native. `decodeAudioTokens()` returns `number[]` (Float32 PCM at 24kHz mono) which feeds directly into an `AudioBuffer`.

### Device Gate
Require **flagship tier (8GB+ RAM)**. The memory stack in chat mode:
```
LLM (3B Q4)       ~2.0 GB
Whisper base       ~150 MB
OuteTTS backbone   ~454 MB
WavTokenizer       ~ 73 MB
OS + app           ~2.0 GB
─────────────────────────
Total:             ~4.7 GB   → fits 8GB devices, tight on 6GB
```
Show a warning (not a hard block) for high-tier (6-8GB) devices. Block only on low/medium (<6GB).

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

Storage directory: `${RNFS.DocumentDirectoryPath}/tts-models/`

---

## New Package

```bash
npm install react-native-audio-api
```

iOS: run `pod install` after.  
Android: auto-linked.

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

export const TTS_MIN_RAM_GB = 6; // warn below this
export const TTS_BLOCK_RAM_GB = 4; // hard block below this
```

---

### 2. `src/services/ttsService.ts`

Full implementation shape. Mirror the whisperService.ts pattern exactly.

```typescript
import { initLlama, LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import { AudioContext } from 'react-native-audio-api';
import logger from '../utils/logger';
import { TTS_BACKBONE_MODEL } from '../constants/ttsModels';

export interface TTSOptions {
  speed?: number; // 0.5–2.0, default 1.0 (applied via sample rate manipulation)
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

  async ensureModelsDirExists(): Promise<void> {
    const dir = this.getModelsDir();
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

    // Serial load — prevent double init
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

  // ─── Speech Generation ───────────────────────────────────────────────────

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.context || !this.isVocoderReady) {
      throw new Error('TTS models not loaded.');
    }
    if (this.isSpeakingFlag) this.stop();

    this.isSpeakingFlag = true;

    try {
      const { prompt, grammar } = await this.context.getFormattedAudioCompletion(
        null, // null = default speaker
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

      if (!this.isSpeakingFlag) return; // stopped during generation

      const pcmSamples = await this.context.decodeAudioTokens(result.audio_tokens);

      if (!this.isSpeakingFlag) return; // stopped during decode

      await this.playPCM(new Float32Array(pcmSamples), options.speed ?? 1.0);
    } finally {
      this.isSpeakingFlag = false;
    }
  }

  private async playPCM(samples: Float32Array, speed: number): Promise<void> {
    // Apply speed by adjusting playback rate (not resampling)
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

    return new Promise((resolve) => {
      source.onended = () => {
        this.currentSource = null;
        resolve();
      };
      source.start();
    });
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

export interface TTSSettings {
  enabled: boolean;          // master toggle
  autoPlay: boolean;         // auto-speak AI responses
  speed: number;             // 0.5–2.0, default 1.0
}

export interface TTSState {
  // Download state
  isBackboneDownloaded: boolean;
  isVocoderDownloaded: boolean;
  isDownloadingBackbone: boolean;
  isDownloadingVocoder: boolean;
  backboneDownloadProgress: number;  // 0–1
  vocoderDownloadProgress: number;   // 0–1

  // Model lifecycle
  isModelLoading: boolean;
  isModelLoaded: boolean;

  // Playback
  isSpeaking: boolean;
  currentMessageId: string | null;

  // Settings (persisted)
  settings: TTSSettings;

  error: string | null;

  // Actions
  checkDownloadStatus: () => Promise<void>;
  downloadModels: () => Promise<void>;
  deleteModels: () => Promise<void>;
  loadModels: () => Promise<void>;
  unloadModels: () => Promise<void>;
  speak: (text: string, messageId: string) => Promise<void>;
  stop: () => void;
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
      settings: {
        enabled: true,
        autoPlay: false,
        speed: 1.0,
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
          // Download backbone
          set({ isDownloadingBackbone: true, backboneDownloadProgress: 0 });
          await ttsService.downloadBackbone((p) =>
            set({ backboneDownloadProgress: p })
          );
          set({ isDownloadingBackbone: false, isBackboneDownloaded: true });

          // Download vocoder
          set({ isDownloadingVocoder: true, vocoderDownloadProgress: 0 });
          await ttsService.downloadVocoder((p) =>
            set({ vocoderDownloadProgress: p })
          );
          set({ isDownloadingVocoder: false, isVocoderDownloaded: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Download failed';
          logger.error('[TTS Store] Download error:', msg);
          set({
            isDownloadingBackbone: false,
            isDownloadingVocoder: false,
            error: msg,
          });
        }
      },

      deleteModels: async () => {
        await ttsService.deleteModels();
        set({
          isBackboneDownloaded: false,
          isVocoderDownloaded: false,
          isModelLoaded: false,
        });
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

      speak: async (text: string, messageId: string) => {
        const { isModelLoaded, settings } = get();
        if (!settings.enabled) return;
        if (!isModelLoaded) return;

        // If already speaking this message, stop it
        if (get().currentMessageId === messageId && get().isSpeaking) {
          get().stop();
          return;
        }

        // Stop any current speech
        ttsService.stop();
        set({ isSpeaking: true, currentMessageId: messageId, error: null });

        try {
          await ttsService.speak(text, { speed: settings.speed });
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

      updateSettings: (patch) => {
        set((state) => ({ settings: { ...state.settings, ...patch } }));
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'tts-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist settings — runtime state is transient
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
import { TTS_BLOCK_RAM_GB } from '../constants/ttsModels';

export function useTTS() {
  const store = useTTSStore();

  // Check download status on mount
  useEffect(() => {
    store.checkDownloadStatus();
  }, []);

  const canRunOnDevice = useCallback(async (): Promise<boolean> => {
    const ramGB = await hardwareService.getTotalMemoryGB();
    return ramGB >= TTS_BLOCK_RAM_GB;
  }, []);

  const speakMessage = useCallback(
    (text: string, messageId: string) => {
      // Auto-load if models are downloaded but not yet loaded
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
      (store.backboneDownloadProgress * 0.86 + store.vocoderDownloadProgress * 0.14), // weighted by file size
  };
}
```

---

### 5. `src/components/TTSButton/index.tsx`

Play/stop button that appears on each assistant message bubble.

```typescript
import React from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { useTTSStore } from '../../stores/ttsStore';
import { SPACING } from '../../constants';

interface TTSButtonProps {
  text: string;
  messageId: string;
}

export const TTSButton: React.FC<TTSButtonProps> = ({ text, messageId }) => {
  const { colors } = useTheme();
  const { speak, stop, isSpeaking, isModelLoading, currentMessageId, settings, isModelLoaded, areBothDownloaded } = useTTSStore();

  const isThisMessageSpeaking = isSpeaking && currentMessageId === messageId;

  // Pulse animation when speaking
  const opacity = useSharedValue(1);
  React.useEffect(() => {
    if (isThisMessageSpeaking) {
      opacity.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1,
        false
      );
    } else {
      opacity.value = withTiming(1, { duration: 200 });
    }
  }, [isThisMessageSpeaking]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Don't render if TTS is disabled or models not downloaded
  if (!settings.enabled || !areBothDownloaded) return null;

  if (isModelLoading && currentMessageId === messageId) {
    return <ActivityIndicator size="small" color={colors.textMuted} style={styles.button} />;
  }

  const handlePress = () => {
    if (isThisMessageSpeaking) {
      stop();
    } else {
      // Load models on first use if not loaded
      if (!isModelLoaded) {
        useTTSStore.getState().loadModels().then(() => {
          useTTSStore.getState().speak(text, messageId);
        });
      } else {
        speak(text, messageId);
      }
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} style={styles.button} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Animated.View style={isThisMessageSpeaking ? animatedStyle : undefined}>
        <Icon
          name={isThisMessageSpeaking ? 'volume-2' : 'volume-1'}
          size={14}
          color={isThisMessageSpeaking ? colors.primary : colors.textMuted}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: SPACING.xs,
  },
});
```

---

### 6. `src/screens/TTSSettingsScreen/index.tsx`

New screen. Accessible from SettingsScreen → "Text to Speech" row.

Structure (follow VoiceSettingsScreen.tsx pattern exactly):

**Sections:**
1. **Header** — back button + "Text to Speech" title
2. **Master toggle card** — enable/disable TTS entirely
3. **Model download card** — shows download status for both files with individual progress bars; "Download (527 MB)" button; "Remove" when downloaded
4. **Settings card** (only shown when downloaded) — Speed slider (0.5–2.0x with labels "0.5x", "1x", "2x"), Auto-play toggle
5. **Device compatibility card** — RAM check, shows warning if <8GB
6. **Privacy card** — "All speech generated on your device. Nothing is sent to any server."

**Key behaviors:**
- Download backbone first, then vocoder sequentially (not parallel — too much I/O pressure)
- Show two separate progress bars during download labeled "Voice model" and "Audio decoder"
- Speed slider uses `Slider` from `@react-native-community/slider`
- Auto-play toggle: when enabled, `speak()` is called automatically after each AI completion (wired in ChatScreen)
- RAM warning: call `hardwareService.getTotalMemoryGB()` on mount; show yellow warning card if < 8GB

---

## Files to Modify

### 7. `src/stores/index.ts`

Add:
```typescript
export { useTTSStore } from './ttsStore';
```

### 8. `src/services/index.ts`

Add:
```typescript
export { ttsService } from './ttsService';
```

### 9. `src/navigation/types.ts`

Add `TTSSettings: undefined` to `RootStackParamList`.

### 10. `src/navigation/AppNavigator.tsx`

Import `TTSSettingsScreen` and add inside `RootStack.Navigator`:
```tsx
<RootStack.Screen name="TTSSettings" component={TTSSettingsScreen} options={{ headerShown: false }} />
```

### 11. `src/screens/index.ts`

Export `TTSSettingsScreen`.

### 12. `src/screens/SettingsScreen.tsx`

Add a nav row pointing to `TTSSettings` (after the "Voice" row, before "Device Info"):
```tsx
<TouchableOpacity onPress={() => navigation.navigate('TTSSettings')}>
  <Icon name="volume-2" />
  <Text>Text to Speech</Text>
  <Icon name="chevron-right" />
</TouchableOpacity>
```
Follow the exact style of the existing Voice row.

### 13. `src/components/ChatMessage/index.tsx`

In the assistant message render path, add `TTSButton` to the action row underneath the message content. Find the existing copy/action area and add:

```tsx
import { TTSButton } from '../TTSButton';

// In assistant message footer, alongside copy button:
<TTSButton
  text={stripControlTokens(message.content)}
  messageId={message.id}
/>
```

The `stripControlTokens` utility is already imported in this file.

### 14. Chat auto-play (ChatScreen or useChatStore)

When `autoPlay` is enabled, after a streaming response completes, call `speak()` automatically.

Find where `isStreaming` transitions from `true → false` for assistant messages. In `useChatStore` or the chat screen's effect, add:

```typescript
// After streaming completes:
const { settings, areBothDownloaded, isModelLoaded, speak, loadModels } = useTTSStore.getState();
if (settings.enabled && settings.autoPlay && areBothDownloaded) {
  const lastMessage = getLastAssistantMessage();
  if (lastMessage) {
    if (!isModelLoaded) {
      await loadModels();
    }
    speak(stripControlTokens(lastMessage.content), lastMessage.id);
  }
}
```

---

## Tests to Write

### `__tests__/unit/services/ttsService.test.ts`
- `downloadBackbone` writes file to correct path
- `downloadVocoder` writes file to correct path
- `loadModels` calls `initLlama` with correct params, then `initVocoder`
- `loadModels` throws if `isVocoderEnabled` returns false
- `speak` calls `getFormattedAudioCompletion`, `getAudioCompletionGuideTokens`, `completion`, `decodeAudioTokens` in order
- `stop` sets `isSpeakingFlag` to false and calls `currentSource.stop()`
- `unloadModels` calls `releaseVocoder` and `release`

Mock: `llama.rn` (`initLlama`, `LlamaContext`), `react-native-fs` (RNFS), `react-native-audio-api`

### `__tests__/unit/stores/ttsStore.test.ts`
- `downloadModels` sets progress states correctly
- `speak` sets `isSpeaking: true`, then `false` after completion
- `speak` on same messageId while speaking → calls `stop()`
- `updateSettings` merges partial settings correctly
- Settings are persisted (speed, enabled, autoPlay survive re-hydration)

### `__tests__/integration/tts.test.ts`
- Full flow: download → load → speak → stop wires through store correctly
- Auto-play: when `autoPlay: true` and a streaming message completes, `speak` is called

---

## Implementation Order

Execute in this exact order to avoid broken intermediate states:

1. `src/constants/ttsModels.ts` — no deps
2. `src/services/ttsService.ts` — depends on constants
3. `src/stores/ttsStore.ts` — depends on service
4. `src/hooks/useTTS.ts` — depends on store
5. `src/stores/index.ts` — add export
6. `src/services/index.ts` — add export
7. `src/navigation/types.ts` — add route type
8. `src/screens/TTSSettingsScreen/index.tsx` — depends on store, hook
9. `src/screens/index.ts` — add export
10. `src/navigation/AppNavigator.tsx` — add screen
11. `src/screens/SettingsScreen.tsx` — add nav row
12. `src/components/TTSButton/index.tsx` — depends on store
13. `src/components/ChatMessage/index.tsx` — add TTSButton
14. Wire auto-play into chat completion flow
15. Write all tests
16. `npm install react-native-audio-api` + `pod install`

---

## Future: Upgrade to OuteTTS 1.0

When llama.cpp PR#12794 (DAC decoder) merges and llama.rn PR#300 (codec.cpp integration) ships:

1. Add new entry to `ttsModels.ts`:
```typescript
export const TTS_BACKBONE_MODEL_V2 = {
  id: 'outetts-1.0-0.6b-q4',
  backboneFile: 'OuteTTS-1.0-0.6B-Q4_K_M.gguf',
  backboneUrl: 'https://huggingface.co/OuteAI/OuteTTS-1.0-0.6B-GGUF/resolve/main/OuteTTS-1.0-0.6B-Q4_K_M.gguf',
  backboneSizeMB: 402,
  vocoderFile: 'dac-24khz.gguf',   // TBD — no GGUF exists yet
  vocoderUrl: '...',
  vocoderSizeMB: ~100,             // estimate
  sampleRate: 24000,
};
```
2. The `ttsService.ts` API is unchanged — it's model-agnostic.
3. The store gets a `modelVersion` setting to let users choose.
4. 0.3 and 1.0 can coexist on disk; only one is loaded at a time.

---

## Memory Safety

Before calling `loadModels()`, check available memory:

```typescript
import { hardwareService } from '../services/hardware';

const available = await hardwareService.getAvailableMemoryGB();
if (available < 1.0) {
  // Not enough headroom — prompt user to close other features first
  throw new Error('Not enough free memory. Try closing image generation first.');
}
```

This check belongs in `useTTSStore.loadModels()` before calling `ttsService.loadModels()`.
