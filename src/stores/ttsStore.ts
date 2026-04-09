import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ttsRegistry } from '../engine';
import type {
  EnginePhase,
  TTSEngine,
  TTSVoice,
  ModelAssetState,
} from '../engine';
import { OuteTTSEngine } from '../engine';
import logger from '../utils/logger';

export type InterfaceMode = 'chat' | 'audio';

export interface TTSSettings {
  interfaceMode: InterfaceMode;
  enabled: boolean;
  autoPlay: boolean;
  speed: number;
  /** Active engine ID */
  engineId: string;
  /** Per-engine voice selection — remembers voice when switching engines */
  voiceByEngine: Record<string, string>;
}

export interface TTSState {
  // ── Engine state (synced from active engine events) ─────────────────────
  phase: EnginePhase;
  currentMessageId: string | null;
  currentAmplitude: number;
  playbackElapsed: number;
  playSessionId: number;
  error: string | null;

  // ── Derived booleans (from phase — backward compat for UI) ──────────────
  isReady: boolean;
  isDownloading: boolean;
  isLoading: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  isGeneratingAudio: boolean;

  // ── Assets (from active engine) ─────────────────────────────────────────
  assets: ModelAssetState[];
  overallDownloadProgress: number;

  // ── Voices (from active engine) ─────────────────────────────────────────
  voices: TTSVoice[];
  activeVoiceId: string | null;

  // ── Cache ───────────────────────────────────────────────────────────────
  audioCacheSizeMB: number;

  // ── Settings (persisted) ────────────────────────────────────────────────
  settings: TTSSettings;

  // ── Actions ─────────────────────────────────────────────────────────────
  setEngine: (engineId: string) => Promise<void>;
  initializeEngine: () => Promise<void>;
  releaseEngine: () => Promise<void>;

  // Download
  checkDownloadStatus: () => Promise<void>;
  downloadModels: () => Promise<void>;
  deleteModels: () => Promise<void>;

  // Chat Mode
  speak: (text: string, messageId: string) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;

  // Audio Mode
  generateAndSave: (
    text: string,
    conversationId: string,
    messageId: string,
  ) => Promise<{ path: string; waveformData: number[]; durationSeconds: number }>;
  playMessage: (messageId: string, filePath: string, startOffset?: number) => Promise<void>;
  stopPlayback: () => void;

  // Voice
  setVoice: (voiceId: string) => Promise<void>;

  // Cache
  refreshCacheSize: () => Promise<void>;
  clearAudioCache: () => Promise<void>;

  // Settings
  updateSettings: (patch: Partial<TTSSettings>) => void;
  clearError: () => void;

  // ── Internal ────────────────────────────────────────────────────────────
  _subscribeToEngine: (engine: TTSEngine) => () => void;
  _unsubscribe: (() => void) | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function phaseToFlags(phase: EnginePhase) {
  return {
    isReady: phase === 'ready' || phase === 'processing' || phase === 'paused',
    isDownloading: phase === 'downloading',
    isLoading: phase === 'loading',
    isSpeaking: phase === 'processing',
    isPaused: phase === 'paused',
    isGeneratingAudio: false, // Set explicitly during speak for non-streaming engines
  };
}

// ── Default engine ────────────────────────────────────────────────────────────

const DEFAULT_ENGINE_ID = 'kokoro';

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTTSStore = create<TTSState>()(
  persist(
    (set, get) => ({
      // Initial state
      phase: 'idle',
      currentMessageId: null,
      currentAmplitude: 0,
      playbackElapsed: 0,
      playSessionId: 0,
      error: null,
      ...phaseToFlags('idle'),
      assets: [],
      overallDownloadProgress: 0,
      voices: [],
      activeVoiceId: null,
      audioCacheSizeMB: 0,
      _unsubscribe: null,

      settings: {
        interfaceMode: 'chat',
        enabled: true,
        autoPlay: false,
        speed: 1.0,
        engineId: DEFAULT_ENGINE_ID,
        voiceByEngine: {},
      },

      // ── Subscribe to engine events ────────────────────────────────────────

      _subscribeToEngine: (engine: TTSEngine) => {
        const unsubPhase = engine.on('phaseChange', (phase) => {
          set({
            phase,
            ...phaseToFlags(phase),
            error: phase === 'error' ? get().error : null,
          });
        });

        const unsubDownload = engine.on('downloadProgress', (_data) => {
          set({ overallDownloadProgress: engine.getOverallDownloadProgress() });
        });

        const unsubAmplitude = engine.on('amplitudeChange', (amplitude) => {
          set({ currentAmplitude: amplitude });
        });

        const unsubTick = engine.on('playbackTick', (elapsed) => {
          set({ playbackElapsed: elapsed });
        });

        const unsubError = engine.on('error', (data) => {
          logger.error('[TTS Store] Engine error:', data.code, data.message);
          set({ error: data.message });
        });

        const unsubVoice = engine.on('voiceChanged', (voiceId) => {
          set({ activeVoiceId: voiceId });
        });

        return () => {
          unsubPhase();
          unsubDownload();
          unsubAmplitude();
          unsubTick();
          unsubError();
          unsubVoice();
        };
      },

      // ── Engine management ─────────────────────────────────────────────────

      setEngine: async (engineId: string) => {
        const prev = get()._unsubscribe;
        prev?.();

        const engine = await ttsRegistry.setActiveEngine(engineId);
        const unsub = get()._subscribeToEngine(engine);

        // Sync voices and assets
        const voices = engine.getVoices();
        const activeVoice = engine.getActiveVoice();
        const voiceByEngine = { ...get().settings.voiceByEngine };
        const savedVoice = voiceByEngine[engineId];

        // Restore saved voice or use engine default
        if (savedVoice && voices.some(v => v.id === savedVoice)) {
          await engine.setVoice(savedVoice).catch(() => {});
        }

        const assets = await engine.checkAssetStatus().catch(() => [] as ModelAssetState[]);

        set({
          _unsubscribe: unsub,
          phase: engine.getPhase(),
          ...phaseToFlags(engine.getPhase()),
          voices,
          activeVoiceId: savedVoice ?? activeVoice?.id ?? null,
          assets,
          overallDownloadProgress: engine.getOverallDownloadProgress(),
          error: null,
          settings: { ...get().settings, engineId },
        });
      },

      initializeEngine: async () => {
        const engine = ttsRegistry.getActiveEngine();
        if (!engine) return;

        set({ error: null });
        try {
          await engine.initialize();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to initialize engine';
          logger.error('[TTS Store] Initialize error:', msg);
          set({ error: msg });
        }
      },

      releaseEngine: async () => {
        const engine = ttsRegistry.getActiveEngine();
        if (!engine) return;
        await engine.release();
      },

      // ── Download ──────────────────────────────────────────────────────────

      checkDownloadStatus: async () => {
        const engine = ttsRegistry.getActiveEngine();
        if (!engine) return;
        const assets = await engine.checkAssetStatus();
        set({
          assets,
          overallDownloadProgress: engine.getOverallDownloadProgress(),
        });
      },

      downloadModels: async () => {
        const engine = ttsRegistry.getActiveEngine();
        if (!engine) return;
        if (get().isDownloading) return; // Prevent double downloads
        set({ error: null });
        try {
          await engine.downloadAssets();
          const assets = await engine.checkAssetStatus();
          set({ assets, overallDownloadProgress: engine.getOverallDownloadProgress() });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Download failed';
          logger.error('[TTS Store] Download error:', msg);
          set({ error: msg });
        }
      },

      deleteModels: async () => {
        const engine = ttsRegistry.getActiveEngine();
        if (!engine) return;
        await engine.deleteAssets();
        const assets = await engine.checkAssetStatus();
        set({ assets, overallDownloadProgress: 0 });
      },

      // ── Chat Mode ─────────────────────────────────────────────────────────

      speak: async (text: string, messageId: string) => {
        const { settings } = get();
        if (!settings.enabled) return;

        // Toggle off if same message
        if (get().currentMessageId === messageId && get().isSpeaking) {
          get().stop();
          return;
        }

        const engine = ttsRegistry.getActiveEngine();
        if (!engine) return;

        // If engine not ready, try to initialize (for OuteTTS which needs explicit load)
        if (engine.getPhase() === 'idle' && engine.isFullyDownloaded()) {
          try {
            await engine.initialize();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to initialize engine';
            logger.error('[TTS Store] Auto-init failed:', msg);
            set({ error: msg });
            return;
          }
        }

        if (engine.getPhase() !== 'ready') return;

        set({
          currentMessageId: messageId,
          playSessionId: get().playSessionId + 1,
          error: null,
        });

        try {
          await engine.speak(text, {
            speed: settings.speed,
            voiceId: settings.voiceByEngine[settings.engineId],
            messageId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Speech failed';
          logger.error('[TTS Store] Speak error:', msg);
          set({ error: msg });
        } finally {
          if (get().currentMessageId === messageId) {
            set({ currentMessageId: null, currentAmplitude: 0, playbackElapsed: 0 });
          }
        }
      },

      stop: () => {
        const engine = ttsRegistry.getActiveEngine();
        engine?.stop();
        set({
          currentMessageId: null,
          currentAmplitude: 0,
          playbackElapsed: 0,
        });
      },

      pause: () => {
        const engine = ttsRegistry.getActiveEngine();
        engine?.pause();
        set({ currentAmplitude: 0 });
      },

      resume: () => {
        const engine = ttsRegistry.getActiveEngine();
        engine?.resume();
      },

      // ── Audio Mode ────────────────────────────────────────────────────────

      generateAndSave: async (text, conversationId, messageId) => {
        const engine = ttsRegistry.getActiveEngine();
        if (!engine) throw new Error('No active TTS engine');
        if (!engine.capabilities.generateAndSave) {
          throw new Error(`${engine.displayName} does not support audio generation.`);
        }

        const { settings } = get();
        const result = await engine.generateAndSave(text, conversationId, messageId, {
          speed: settings.speed,
          voiceId: settings.voiceByEngine[settings.engineId],
        });

        await get().refreshCacheSize();
        return {
          path: result.filePath,
          waveformData: result.waveformData,
          durationSeconds: result.durationSeconds,
        };
      },

      playMessage: async (messageId, filePath, startOffset = 0) => {
        if (get().currentMessageId === messageId && get().isSpeaking) {
          get().stopPlayback();
          return;
        }

        const engine = ttsRegistry.getActiveEngine();
        if (!engine) return;

        set({
          currentMessageId: messageId,
          playSessionId: get().playSessionId + 1,
          error: null,
        });

        try {
          await engine.playFromFile(filePath, {
            speed: get().settings.speed,
            startOffset,
            messageId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Playback failed';
          logger.error('[TTS Store] Playback error:', msg);
          if (get().currentMessageId === messageId) set({ error: msg });
        } finally {
          if (get().currentMessageId === messageId) {
            set({ currentMessageId: null });
          }
        }
      },

      stopPlayback: () => {
        const engine = ttsRegistry.getActiveEngine();
        engine?.stop();
        set({ currentMessageId: null });
      },

      // ── Voice ─────────────────────────────────────────────────────────────

      setVoice: async (voiceId: string) => {
        const engine = ttsRegistry.getActiveEngine();
        if (!engine) return;

        // Save per-engine voice preference
        const voiceByEngine = {
          ...get().settings.voiceByEngine,
          [get().settings.engineId]: voiceId,
        };
        set({ settings: { ...get().settings, voiceByEngine } });

        await engine.setVoice(voiceId);
      },

      // ── Cache ─────────────────────────────────────────────────────────────

      refreshCacheSize: async () => {
        const engine = ttsRegistry.getActiveEngine();
        if (engine && engine instanceof OuteTTSEngine) {
          const mb = await engine.getAudioCacheSizeMB();
          set({ audioCacheSizeMB: mb });
        }
      },

      clearAudioCache: async () => {
        const engine = ttsRegistry.getActiveEngine();
        if (engine && engine instanceof OuteTTSEngine) {
          await engine.clearAudioCache();
          set({ audioCacheSizeMB: 0 });
        }
      },

      // ── Settings ──────────────────────────────────────────────────────────

      updateSettings: (patch) => {
        set((state) => ({ settings: { ...state.settings, ...patch } }));
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'tts-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ settings: state.settings }),
      // Migrate persisted settings from pre-engine-interface format
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const s = state.settings as unknown as Record<string, unknown>;
        // Old format had voiceId (OuteTTS) and kokoroVoiceId (Kokoro) as flat fields
        if (!s.voiceByEngine || typeof s.voiceByEngine !== 'object') {
          s.voiceByEngine = {};
        }
        const vbe = s.voiceByEngine as Record<string, string>;
        if (s.kokoroVoiceId && typeof s.kokoroVoiceId === 'string' && !vbe.kokoro) {
          vbe.kokoro = s.kokoroVoiceId as string;
          delete s.kokoroVoiceId;
        }
        if (s.voiceId && typeof s.voiceId === 'string' && !vbe.outetts) {
          vbe.outetts = s.voiceId as string;
          delete s.voiceId;
        }
        if (!s.engineId) {
          s.engineId = DEFAULT_ENGINE_ID;
        }
      },
    },
  ),
);
