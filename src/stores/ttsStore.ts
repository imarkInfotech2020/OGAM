import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ttsService } from '../services/ttsService';
import logger from '../utils/logger';

export type InterfaceMode = 'chat' | 'audio';

export interface TTSSettings {
  /** 'chat' = text bubbles + play button per message; 'audio' = waveform bubbles */
  interfaceMode: InterfaceMode;
  enabled: boolean;
  /** Chat Mode only — auto-speak AI responses after streaming */
  autoPlay: boolean;
  speed: number;
  voiceId: string;
}

export interface TTSState {
  // Download
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
  generateAndSave: (
    text: string,
    conversationId: string,
    messageId: string,
  ) => Promise<{ path: string; waveformData: number[]; durationSeconds: number }>;
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
        set({
          isBackboneDownloaded: false,
          isVocoderDownloaded: false,
          isModelLoaded: false,
        });
      },

      loadModels: async () => {
        if (get().isModelLoaded || get().isModelLoading) {
          return;
        }
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

      // ── Chat Mode ───────────────────────────────────────────────────────────

      speak: async (text: string, messageId: string) => {
        const { isModelLoaded, settings } = get();
        if (!settings.enabled || !isModelLoaded) {
          return;
        }
        // Tapping same message while speaking → stop
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

      // ── Audio Mode ──────────────────────────────────────────────────────────

      generateAndSave: async (text, conversationId, messageId) => {
        const { settings } = get();
        const { path, audio } = await ttsService.generateAndSave(
          text,
          { conversationId, messageId },
          { voiceId: settings.voiceId },
        );
        await get().refreshCacheSize();
        return { path, waveformData: audio.waveformData, durationSeconds: audio.durationSeconds };
      },

      playMessage: async (messageId, filePath, startOffset = 0) => {
        const { settings } = get();
        if (get().currentMessageId === messageId && get().isSpeaking) {
          get().stopPlayback();
          return;
        }
        ttsService.stop();
        set({ isSpeaking: true, currentMessageId: messageId, error: null });
        try {
          await ttsService.playFromFile(filePath, settings.speed, startOffset);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Playback failed';
          logger.error('[TTS Store] Playback error:', msg);
          set({ error: msg });
        } finally {
          set({ isSpeaking: false, currentMessageId: null });
        }
      },

      stopPlayback: () => {
        ttsService.stop();
        set({ isSpeaking: false, currentMessageId: null });
      },

      // ── Cache ───────────────────────────────────────────────────────────────

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
      // Only persist settings — runtime state is transient
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);
