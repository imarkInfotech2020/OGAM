/**
 * Qwen3TTSEngine — TTSEngine stub for Qwen3-TTS.
 *
 * Multi-model pipeline:
 *   1. Talker (0.6B LLM, GGUF) — generates speech token sequences from text
 *   2. Predictor (GGUF) — fills parallel codebook tracks (16 codebooks)
 *   3. Codec decoder (ONNX) — converts token grid to PCM audio waveform
 *
 * The talker and predictor run via llama.rn (GGUF).
 * The codec decoder runs via ONNX Runtime (onnxruntime-react-native).
 *
 * 12Hz frame rate = dramatically fewer tokens per second of audio than
 * OuteTTS (75Hz) or most other TTS models. This makes on-device inference
 * much more feasible.
 *
 * STATUS: Stub — asset management and lifecycle are wired up; the actual
 * inference pipeline is TODO pending integration testing.
 */
import RNFS from 'react-native-fs';
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
import { QWEN3_TTS_ASSETS } from './models';
import logger from '../../../../utils/logger';

export class Qwen3TTSEngine
  extends OnDeviceEngineEmitter<TTSEngineEvents>
  implements TTSEngine
{
  readonly id = 'qwen3-tts';
  readonly displayName = 'Qwen3 TTS (0.6B)';
  readonly capabilities: TTSEngineCapabilities = {
    streaming: false, // Generate-then-play (streaming planned for v2)
    voiceCloning: true,
    pauseResume: true,
    generateAndSave: true,
    platformRequirements: {
      android: { minSdkVersion: 26 },
      ios: { minVersion: 15 },
    },
    peakRamMB: 600,
  };

  private _phase: EnginePhase = 'idle';
  private _assetStates: ModelAssetState[] = [];

  // TODO: llama.rn contexts for talker + predictor
  // private _talkerContext: LlamaContext | null = null;
  // private _predictorContext: LlamaContext | null = null;
  // TODO: ONNX Runtime session for codec decoder
  // private _codecSession: InferenceSession | null = null;

  constructor() {
    super();
    this._assetStates = QWEN3_TTS_ASSETS.map(asset => ({
      asset,
      status: 'not-downloaded' as const,
      progress: 0,
    }));
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

  // ── Paths ───────────────────────────────────────────────────────────────

  private _getModelsDir(): string {
    return `${RNFS.DocumentDirectoryPath}/tts-models/qwen3`;
  }

  private _getAssetPath(asset: ModelAsset): string {
    return `${this._getModelsDir()}/${asset.filename}`;
  }

  private async _ensureDir(dir: string): Promise<void> {
    if (!(await RNFS.exists(dir))) {
      await RNFS.mkdir(dir);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  isSupported(): boolean {
    // TODO: Runtime platform version check
    return true;
  }

  async initialize(): Promise<void> {
    if (!this.isFullyDownloaded()) {
      throw new Error('Qwen3-TTS models not downloaded.');
    }

    this._setPhase('loading');

    try {
      // TODO: Load all three models
      //
      // const talkerPath = this._getAssetPath(QWEN3_TTS_TALKER);
      // const predictorPath = this._getAssetPath(QWEN3_TTS_PREDICTOR);
      // const codecPath = this._getAssetPath(QWEN3_TTS_CODEC);
      //
      // this._talkerContext = await initLlama({
      //   model: talkerPath,
      //   n_ctx: 4096,
      //   n_threads: 4,
      // });
      //
      // this._predictorContext = await initLlama({
      //   model: predictorPath,
      //   n_ctx: 2048,
      //   n_threads: 4,
      // });
      //
      // this._codecSession = await InferenceSession.create(codecPath);

      logger.log('[Qwen3TTSEngine] Models loaded (stub).');
      this._setPhase('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Qwen3-TTS';
      this._setPhase('error');
      this.emit('error', { code: 'QWEN3_LOAD', message: msg, recoverable: true });
      throw err;
    }
  }

  async release(): Promise<void> {
    // TODO: Release llama.rn contexts and ONNX session
    // this._talkerContext?.release();
    // this._predictorContext?.release();
    // this._codecSession?.release();
    this._setPhase('idle');
  }

  async destroy(): Promise<void> {
    await this.release();
    await this.deleteAssets();
  }

  // ── Assets ──────────────────────────────────────────────────────────────

  getRequiredAssets(): ModelAsset[] {
    return QWEN3_TTS_ASSETS;
  }

  async checkAssetStatus(): Promise<ModelAssetState[]> {
    await this._ensureDir(this._getModelsDir());
    const states: ModelAssetState[] = [];
    for (const asset of QWEN3_TTS_ASSETS) {
      const path = this._getAssetPath(asset);
      const exists = await RNFS.exists(path);
      states.push({
        asset,
        status: exists ? 'downloaded' : 'not-downloaded',
        progress: exists ? 1 : 0,
        localPath: exists ? path : undefined,
      });
    }
    this._assetStates = states;
    return states;
  }

  async downloadAssets(assetIds?: string[]): Promise<void> {
    await this._ensureDir(this._getModelsDir());
    const toDownload = assetIds
      ? QWEN3_TTS_ASSETS.filter(a => assetIds.includes(a.id))
      : QWEN3_TTS_ASSETS;

    this._setPhase('downloading');

    for (const asset of toDownload) {
      const dest = this._getAssetPath(asset);
      if (await RNFS.exists(dest)) {
        this._updateAssetState(asset.id, { status: 'downloaded', progress: 1, localPath: dest });
        continue;
      }

      this._updateAssetState(asset.id, { status: 'downloading', progress: 0 });

      const dl = RNFS.downloadFile({
        fromUrl: asset.url,
        toFile: dest,
        progressDivider: 1,
        progress: (res) => {
          const p = res.bytesWritten / res.contentLength;
          this._updateAssetState(asset.id, { status: 'downloading', progress: p });
          this.emit('downloadProgress', {
            assetId: asset.id,
            progress: p,
            bytesWritten: res.bytesWritten,
            totalBytes: res.contentLength,
          });
        },
      });

      const result = await dl.promise;
      if (result.statusCode !== 200) {
        await RNFS.unlink(dest).catch(() => {});
        this._updateAssetState(asset.id, { status: 'error', progress: 0, error: `HTTP ${result.statusCode}` });
        throw new Error(`Download failed for ${asset.label}: HTTP ${result.statusCode}`);
      }
      this._updateAssetState(asset.id, { status: 'downloaded', progress: 1, localPath: dest });
    }

    if (this.isFullyDownloaded()) {
      this._setPhase('idle');
    }
  }

  async deleteAssets(assetIds?: string[]): Promise<void> {
    await this.release();
    const toDelete = assetIds
      ? QWEN3_TTS_ASSETS.filter(a => assetIds.includes(a.id))
      : QWEN3_TTS_ASSETS;

    for (const asset of toDelete) {
      const path = this._getAssetPath(asset);
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
      this._updateAssetState(asset.id, { status: 'not-downloaded', progress: 0 });
    }
  }

  getOverallDownloadProgress(): number {
    const totalSize = QWEN3_TTS_ASSETS.reduce((sum, a) => sum + a.sizeBytes, 0);
    let weightedProgress = 0;
    for (const state of this._assetStates) {
      weightedProgress += state.progress * (state.asset.sizeBytes / totalSize);
    }
    return weightedProgress;
  }

  isFullyDownloaded(): boolean {
    return this._assetStates.every(s => s.status === 'downloaded');
  }

  private _updateAssetState(
    assetId: string,
    patch: Pick<ModelAssetState, 'status' | 'progress'> & { localPath?: string; error?: string },
  ): void {
    const idx = this._assetStates.findIndex(s => s.asset.id === assetId);
    if (idx >= 0) {
      this._assetStates[idx] = { ...this._assetStates[idx], ...patch };
    }
  }

  // ── Voices ──────────────────────────────────────────────────────────────

  getVoices(): TTSVoice[] {
    // TODO: Qwen3-TTS CustomVoice variant has 9 built-in voices.
    // For now expose a default. Voice cloning via referenceAudioPath.
    return [
      { id: 'default', label: 'Default', metadata: { language: 'multilingual' } },
    ];
  }

  getActiveVoice(): TTSVoice | null {
    return this.getVoices()[0];
  }

  async setVoice(voiceId: string): Promise<void> {
    this.emit('voiceChanged', voiceId);
  }

  // ── Speech ──────────────────────────────────────────────────────────────

  async speak(_text: string, _options?: TTSSpeakOptions): Promise<void> {
    // TODO: Implement the three-stage pipeline:
    //
    // 1. Talker inference (llama.rn):
    //    - Format prompt with text + voice tokens
    //    - Run autoregressive generation to produce first-codebook tokens
    //    - 12Hz frame rate = ~12 tokens per second of audio
    //
    // 2. Predictor inference (llama.rn):
    //    - Take first-codebook tokens from talker
    //    - Predict remaining 15 codebook tracks in parallel
    //    - Output: 16-codebook token grid
    //
    // 3. Codec decoding (ONNX Runtime):
    //    - Take 16-codebook token grid
    //    - Decode to PCM Float32 audio at 24kHz
    //    - Emit audioComplete event
    //
    // 4. Play the resulting audio via AudioContext

    throw new Error(
      'Qwen3-TTS inference pipeline not yet implemented. ' +
      'Asset management and lifecycle are ready — the inference integration is TODO.',
    );
  }

  // eslint-disable-next-line max-params
  async generateAndSave(
    _text: string,
    _conversationId: string,
    _messageId: string,
    _options?: TTSSpeakOptions,
  ): Promise<TTSGenerateResult> {
    // TODO: Same pipeline as speak(), but save to file instead of playing
    throw new Error('Qwen3-TTS generateAndSave not yet implemented.');
  }

  async playFromFile(
    _filePath: string,
    _options?: { speed?: number; startOffset?: number; messageId?: string },
  ): Promise<void> {
    // TODO: Standard AudioContext file playback (same as OuteTTS)
    throw new Error('Qwen3-TTS playFromFile not yet implemented.');
  }

  stop(): void {
    // TODO: Abort any in-flight inference + stop audio playback
    if (this._phase === 'processing' || this._phase === 'paused') {
      this._setPhase('ready');
    }
  }

  pause(): void {
    // TODO: Suspend AudioContext
    if (this._phase === 'processing') {
      this._setPhase('paused');
    }
  }

  resume(): void {
    // TODO: Resume AudioContext
    if (this._phase === 'paused') {
      this._setPhase('processing');
    }
  }

  // ── React Bridge ────────────────────────────────────────────────────────

  getBridgeComponent(): React.ComponentType | null {
    return null; // Fully imperative via llama.rn + ONNX Runtime
  }
}
