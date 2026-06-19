/**
 * On-Device Engine Types
 *
 * Base interfaces for multimodal on-device AI engines.
 * TTS is the first concrete implementation; STT, Vision, and LLM
 * engines will inherit the same base pattern.
 *
 * Designed for mobile — optimized for llama.rn, llama.cpp, ONNX Runtime,
 * and ExecuTorch runtimes.
 */
import type React from 'react';

// ─── Engine Phase ───────────────────────────────────────────────────────────

/** Unified lifecycle phase for any on-device engine */
export type EnginePhase =
  | 'idle'         // Not loaded, not doing anything
  | 'downloading'  // One or more assets downloading
  | 'loading'      // Models being loaded into memory
  | 'ready'        // Models loaded, ready to process
  | 'processing'   // Actively running inference or playback
  | 'paused'       // Processing suspended (resumable)
  | 'error';       // Something went wrong

// ─── Model Assets ───────────────────────────────────────────────────────────

export type ModelAssetStatus = 'not-downloaded' | 'downloading' | 'downloaded' | 'error';

/** Describes a single downloadable model file (GGUF, ONNX, .pte, .bin, etc.) */
export interface ModelAsset {
  /** Engine-scoped unique ID (e.g., 'backbone', 'vocoder', 'talker') */
  id: string;
  /** Human-readable label for UI */
  label: string;
  /** Remote URL to download from (e.g., HuggingFace) */
  url: string;
  /** Expected file size in bytes */
  sizeBytes: number;
  /** Local filename (engine decides the directory) */
  filename: string;
}

/** Runtime state of a single model asset */
export interface ModelAssetState {
  asset: ModelAsset;
  status: ModelAssetStatus;
  /** Download progress 0–1 */
  progress: number;
  /** Absolute local file path once downloaded */
  localPath?: string;
  /** Error message if status === 'error' */
  error?: string;
}

// ─── Engine Capabilities ────────────────────────────────────────────────────

export interface EngineCapabilities {
  /** Supports streaming output (chunks emitted during processing) */
  streaming: boolean;
  /** Minimum OS requirements — engine enforces at runtime */
  platformRequirements?: {
    android?: { minSdkVersion: number };
    ios?: { minVersion: number };
  };
  /** Approximate peak RAM usage in MB during inference */
  peakRamMB: number;
}

// ─── Base Event Map ─────────────────────────────────────────────────────────

/** Events shared by all engine modalities */
export interface BaseEngineEvents {
  [key: string]: (...args: any[]) => void;
  /** Fired on every lifecycle phase transition */
  phaseChange: (phase: EnginePhase, previousPhase: EnginePhase) => void;
  /** Fired on download progress for any asset */
  downloadProgress: (data: {
    assetId: string;
    progress: number;
    bytesWritten: number;
    totalBytes: number;
  }) => void;
  /** Fired on any error */
  error: (data: {
    code: string;
    message: string;
    recoverable: boolean;
  }) => void;
}

// ─── Base Engine Interface ──────────────────────────────────────────────────

/**
 * Base interface for all on-device AI engines.
 *
 * Every modality (TTS, STT, Vision, LLM) extends this with modality-specific
 * methods and events. The shared surface covers lifecycle, asset management,
 * and the typed event system.
 *
 * @typeParam TEvents — union of base + modality-specific events
 */
export interface OnDeviceEngine<
  TEvents extends BaseEngineEvents = BaseEngineEvents,
> {
  /** Unique engine identifier (e.g., 'kokoro', 'outetts', 'qwen3-tts') */
  readonly id: string;
  /** Human-readable display name */
  readonly displayName: string;
  /** Static capabilities — does not change at runtime */
  readonly capabilities: EngineCapabilities;

  // ── State ───────────────────────────────────────────────────────────────

  /** Current lifecycle phase */
  getPhase(): EnginePhase;

  // ── Events ──────────────────────────────────────────────────────────────

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof TEvents>(
    event: K,
    listener: TEvents[K],
  ): () => void;

  /** Unsubscribe a specific listener */
  off<K extends keyof TEvents>(
    event: K,
    listener: TEvents[K],
  ): void;

  /** Subscribe to an event once — auto-unsubscribes after first fire */
  once<K extends keyof TEvents>(
    event: K,
    listener: TEvents[K],
  ): () => void;

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Runtime platform compatibility check */
  isSupported(): boolean;

  /**
   * Load models into memory. For hook-based engines this may be a no-op
   * (initialization happens via the React bridge component).
   *
   * Phase transition: idle → loading → ready
   */
  initialize(): Promise<void>;

  /**
   * Release models and resources. Engine returns to 'idle' but retains
   * downloaded assets on disk.
   *
   * Phase transition: any → idle
   */
  release(): Promise<void>;

  /**
   * Full teardown — release models AND delete downloaded assets.
   *
   * Phase transition: any → idle (assets cleared)
   */
  destroy(): Promise<void>;

  // ── Asset Management ────────────────────────────────────────────────────

  /** List of model files this engine requires */
  getRequiredAssets(): ModelAsset[];

  /** Check which assets exist on disk. Updates internal state + emits events. */
  checkAssetStatus(): Promise<ModelAssetState[]>;

  /**
   * Download required assets. Emits `downloadProgress` per asset.
   * @param assetIds — optional subset; omit to download all missing
   */
  downloadAssets(assetIds?: string[]): Promise<void>;

  /**
   * Delete downloaded assets from disk. Releases models first if loaded.
   * @param assetIds — optional subset; omit to delete all
   */
  deleteAssets(assetIds?: string[]): Promise<void>;

  /** Aggregate download progress across all assets (0–1), weighted by size */
  getOverallDownloadProgress(): number;

  /** True if every required asset exists on disk */
  isFullyDownloaded(): boolean;

  // ── React Bridge ────────────────────────────────────────────────────────

  /**
   * If the engine requires a React component mounted in the tree (e.g.,
   * wrapping a React hook), return it here. The app renders it near the
   * root via <EngineBridge />. Return null for fully imperative engines.
   */
  getBridgeComponent(): React.ComponentType | null;
}

// ─── TTS-Specific Types ─────────────────────────────────────────────────────

export interface TTSVoice {
  /** Engine-scoped unique ID (e.g., 'af_heart', 'default', 'zh-female-1') */
  id: string;
  /** Human-readable label */
  label: string;
  /** Freeform metadata — accent, gender, persona, language, etc. */
  metadata: Record<string, string>;
  /** True if this voice supports cloning from reference audio */
  isCloneable?: boolean;
}

export interface TTSEngineCapabilities extends EngineCapabilities {
  /** Supports zero-shot voice cloning from reference audio */
  voiceCloning: boolean;
  /** Supports pause/resume during playback */
  pauseResume: boolean;
  /** Supports generate-and-save-to-file (Audio Mode) */
  generateAndSave: boolean;
}

export interface TTSSpeakOptions {
  /** Playback speed multiplier (0.5–2.0) */
  speed?: number;
  /** Voice ID override (uses active voice if omitted) */
  voiceId?: string;
  /** Message ID for ownership tracking */
  messageId?: string;
  /** Path to reference audio for voice cloning engines */
  referenceAudioPath?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface TTSGenerateResult {
  /** Absolute path to saved audio file */
  filePath: string;
  /** Audio duration in seconds */
  durationSeconds: number;
  /** Downsampled amplitude envelope (~200 points) for waveform UI */
  waveformData: number[];
}

/** TTS-specific events (extends base events) */
export interface TTSEngineEvents extends BaseEngineEvents {
  /** Streaming audio chunk (for engines that support streaming) */
  audioChunk: (data: {
    samples: Float32Array;
    sampleRate: number;
    chunkIndex: number;
    /** True if this is the last chunk in the current utterance */
    isFinal: boolean;
  }) => void;

  /** Full audio generation complete (for non-streaming engines) */
  audioComplete: (data: {
    samples: Float32Array;
    sampleRate: number;
    durationSeconds: number;
    waveformData: number[];
  }) => void;

  /** RMS amplitude update for waveform visualization */
  amplitudeChange: (amplitude: number) => void;

  /** Playback elapsed time tick */
  playbackTick: (elapsedSeconds: number) => void;

  /** Active voice changed */
  voiceChanged: (voiceId: string) => void;
}

// ─── TTS Engine Interface ───────────────────────────────────────────────────

/**
 * The TTS engine interface. Every TTS implementation (Kokoro, OuteTTS,
 * Qwen3-TTS, etc.) implements this. The store delegates to the active
 * engine without knowing which one it is.
 */
export interface TTSEngine extends OnDeviceEngine<TTSEngineEvents> {
  readonly capabilities: TTSEngineCapabilities;

  // ── Voices ──────────────────────────────────────────────────────────────

  /** All voices this engine supports */
  getVoices(): TTSVoice[];

  /** Currently active voice (null if none set) */
  getActiveVoice(): TTSVoice | null;

  /**
   * Set the active voice. Some engines require a reload/remount to change
   * voices — this method handles that transparently. Emits `voiceChanged`
   * when the voice is actually active.
   */
  setVoice(voiceId: string): Promise<void>;

  // ── Speech ──────────────────────────────────────────────────────────────

  /**
   * Speak text aloud (Chat Mode primary method).
   *
   * Streaming engines emit `audioChunk` during playback.
   * Non-streaming engines emit `audioComplete` after generation, then play.
   *
   * Resolves when playback finishes or is stopped.
   * Phase transition: ready → processing → ready
   */
  speak(text: string, options?: TTSSpeakOptions): Promise<void>;

  /**
   * Generate audio and save to file (Audio Mode primary method).
   * Check `capabilities.generateAndSave` before calling.
   */
  generateAndSave(
    text: string,
    conversationId: string,
    messageId: string,
    options?: TTSSpeakOptions,
  ): Promise<TTSGenerateResult>;

  /**
   * Play a previously saved audio file.
   * Used by Audio Mode to replay cached messages.
   */
  playFromFile(
    filePath: string,
    options?: {
      speed?: number;
      startOffset?: number;
      messageId?: string;
    },
  ): Promise<void>;

  /** Stop all speech/playback immediately */
  stop(): void;

  /** Pause current playback (requires capabilities.pauseResume) */
  pause(): void;

  /** Resume paused playback */
  resume(): void;
}
