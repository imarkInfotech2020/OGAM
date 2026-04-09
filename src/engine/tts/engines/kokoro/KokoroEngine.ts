/**
 * KokoroEngine — TTSEngine implementation for Kokoro TTS via ExecuTorch.
 *
 * Wraps react-native-executorch's useTextToSpeech hook through a bridge
 * component pattern. The bridge registers an imperative handle; the engine
 * exposes the standard TTSEngine API.
 */
import { Platform } from 'react-native';
import { OnDeviceEngineEmitter } from '../../../OnDeviceEngineEmitter';
import type {
  EnginePhase,
  TTSEngine,
  TTSEngineCapabilities,
  TTSEngineEvents,
  TTSSpeakOptions,
  TTSGenerateResult,
  TTSVoice,
  ModelAsset,
  ModelAssetState,
} from '../../../types';
import {
  KOKORO_VOICES,
  DEFAULT_KOKORO_VOICE_ID,
  getKokoroTTSVoices,
} from './voices';
import type { KokoroVoiceId } from './voices';
import { createKokoroTTSBridge } from './KokoroTTSBridge';
import logger from '../../../../utils/logger';

/** Bridge interface: the React component pushes these into the engine */
export interface KokoroBridgeHandle {
  speak: (text: string, speed: number) => Promise<void>;
  stop: (instant?: boolean) => void;
  pause: () => void;
  resume: () => void;
  setKeepAlive: (keepAlive: boolean) => void;
}

export class KokoroEngine
  extends OnDeviceEngineEmitter<TTSEngineEvents>
  implements TTSEngine
{
  readonly id = 'kokoro';
  readonly displayName = 'Kokoro TTS';
  readonly capabilities: TTSEngineCapabilities = {
    streaming: true,
    voiceCloning: false,
    pauseResume: true,
    generateAndSave: false,
    platformRequirements: {
      android: { minSdkVersion: 26 },
      ios: { minVersion: 17 },
    },
    peakRamMB: 82,
  };

  private _phase: EnginePhase = 'idle';
  private _bridge: KokoroBridgeHandle | null = null;
  private _activeVoiceId: KokoroVoiceId = DEFAULT_KOKORO_VOICE_ID;
  private _downloadProgress = 0;
  private _currentMessageId: string | null = null;
  private _playSessionId = 0;
  private _BridgeComponent: React.ComponentType;

  constructor() {
    super();
    this._BridgeComponent = createKokoroTTSBridge(this);
  }

  // ── State ───────────────────────────────────────────────────────────────

  getPhase(): EnginePhase {
    return this._phase;
  }

  private _setPhase(phase: EnginePhase): void {
    if (phase === this._phase) return;
    const prev = this._phase;
    this._phase = phase;
    this.emit('phaseChange', phase, prev);
  }

  // ── Bridge callbacks (called by KokoroTTSBridge) ────────────────────────

  /** @internal Called by bridge when hook becomes ready or is torn down */
  _setBridge(handle: KokoroBridgeHandle | null, voiceId: KokoroVoiceId): void {
    this._bridge = handle;
    if (handle) {
      this._activeVoiceId = voiceId;
      this._setPhase('ready');
      logger.log('[KokoroEngine] Bridge registered, voice:', voiceId);
    } else {
      this._setPhase(this._downloadProgress > 0 && this._downloadProgress < 1 ? 'downloading' : 'idle');
    }
  }

  /** @internal Called by bridge to sync download progress */
  _setDownloadProgress(progress: number): void {
    this._downloadProgress = progress;
    if (progress > 0 && progress < 1 && this._phase === 'idle') {
      this._setPhase('downloading');
    }
    this.emit('downloadProgress', {
      assetId: 'kokoro-medium',
      progress,
      bytesWritten: 0,
      totalBytes: 0,
    });
  }

  /** @internal Called by bridge on each audio chunk */
  _onAudioChunk(data: {
    samples: Float32Array;
    sampleRate: number;
    chunkIndex: number;
    isFinal: boolean;
  }): void {
    this.emit('audioChunk', data);
  }

  /** @internal Called by bridge on runtime error */
  _onBridgeError(message: string): void {
    this._bridge = null;
    this._setPhase('error');
    this.emit('error', { code: 'KOKORO_RUNTIME', message, recoverable: false });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  isSupported(): boolean {
    if (Platform.OS === 'android') {
      return (Platform.Version as number) >= 26;
    }
    if (Platform.OS === 'ios') {
      return parseInt(Platform.Version as string, 10) >= 17;
    }
    return false;
  }

  async initialize(): Promise<void> {
    // No-op: Kokoro initializes when the bridge component mounts.
    // The bridge calls _setBridge() which transitions to 'ready'.
  }

  async release(): Promise<void> {
    this._bridge?.stop(true);
    this._bridge = null;
    this._currentMessageId = null;
    this._setPhase('idle');
  }

  async destroy(): Promise<void> {
    await this.release();
    // Kokoro models are managed by executorch's internal cache
  }

  // ── Assets ──────────────────────────────────────────────────────────────

  getRequiredAssets(): ModelAsset[] {
    return [
      {
        id: 'kokoro-medium',
        label: 'Kokoro Medium',
        url: '', // Managed internally by react-native-executorch
        sizeBytes: 82 * 1024 * 1024,
        filename: 'kokoro-medium',
      },
    ];
  }

  async checkAssetStatus(): Promise<ModelAssetState[]> {
    const isReady = this._phase === 'ready';
    return [
      {
        asset: this.getRequiredAssets()[0],
        status: isReady ? 'downloaded' : this._downloadProgress > 0 ? 'downloading' : 'not-downloaded',
        progress: isReady ? 1 : this._downloadProgress,
      },
    ];
  }

  async downloadAssets(): Promise<void> {
    // Handled by react-native-executorch when the hook mounts
  }

  async deleteAssets(): Promise<void> {
    await this.release();
    // Would need executorch API to clear its internal cache
  }

  getOverallDownloadProgress(): number {
    return this._phase === 'ready' ? 1 : this._downloadProgress;
  }

  isFullyDownloaded(): boolean {
    return this._phase === 'ready' || this._downloadProgress >= 1;
  }

  // ── Voices ──────────────────────────────────────────────────────────────

  getVoices(): TTSVoice[] {
    return getKokoroTTSVoices();
  }

  getActiveVoice(): TTSVoice | null {
    return this.getVoices().find(v => v.id === this._activeVoiceId) ?? null;
  }

  async setVoice(voiceId: string): Promise<void> {
    const valid = KOKORO_VOICES.find(v => v.id === voiceId);
    if (!valid) {
      throw new Error(`Unknown Kokoro voice: ${voiceId}`);
    }
    this._activeVoiceId = voiceId as KokoroVoiceId;
    // Emit voiceChanged — the bridge component listens and does key-based remount
    this.emit('voiceChanged', voiceId);
  }

  // ── Speech ──────────────────────────────────────────────────────────────

  async speak(text: string, options?: TTSSpeakOptions): Promise<void> {
    if (!this._bridge) {
      throw new Error('Kokoro bridge not mounted. Is the device supported?');
    }

    const speed = options?.speed ?? 1.0;
    const messageId = options?.messageId ?? null;

    this._currentMessageId = messageId;
    const sessionId = ++this._playSessionId;
    this._setPhase('processing');

    this._bridge.setKeepAlive(false);

    // Retry loop — executorch may still be busy from a previous stream
    const MAX_RETRIES = 10;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        logger.log('[KokoroEngine] speak attempt', attempt + 1);
        await this._bridge.speak(text, speed);
        break;
      } catch (err: unknown) {
        const errCode = (err as { code?: number })?.code;
        if (errCode === 104 && attempt < MAX_RETRIES - 1) {
          logger.log('[KokoroEngine] executorch busy, retrying in 200ms');
          await new Promise<void>((r) => setTimeout(r, 200));
          continue;
        }
        this.emit('error', {
          code: 'KOKORO_SPEAK',
          message: err instanceof Error ? err.message : 'Speech failed',
          recoverable: true,
        });
        throw err;
      }
    }

    // Only clear state if this speak call still owns playback
    if (this._playSessionId === sessionId) {
      this._currentMessageId = null;
      this._setPhase('ready');
    }
  }

  async generateAndSave(): Promise<TTSGenerateResult> {
    throw new Error('Kokoro does not support generateAndSave. Use an engine with generateAndSave capability.');
  }

  async playFromFile(): Promise<void> {
    throw new Error('Kokoro does not support file playback.');
  }

  stop(): void {
    this._bridge?.stop(true);
    this._currentMessageId = null;
    if (this._phase === 'processing' || this._phase === 'paused') {
      this._setPhase(this._bridge ? 'ready' : 'idle');
    }
  }

  pause(): void {
    this._bridge?.pause();
    if (this._phase === 'processing') {
      this._setPhase('paused');
    }
  }

  resume(): void {
    this._bridge?.resume();
    if (this._phase === 'paused') {
      this._setPhase('processing');
    }
  }

  // ── React Bridge ────────────────────────────────────────────────────────

  getBridgeComponent(): React.ComponentType | null {
    return this._BridgeComponent;
  }
}
