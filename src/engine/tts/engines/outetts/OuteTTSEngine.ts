/* eslint-disable max-lines */
/**
 * OuteTTSEngine — TTSEngine implementation for OuteTTS via llama.rn.
 *
 * Absorbs the logic from services/ttsService.ts into the engine interface.
 * Fully imperative — no React bridge needed.
 */
import { initLlama } from 'llama.rn';
import type { LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import { AudioContext, AudioBufferSourceNode } from 'react-native-audio-api';
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
import { OUTETTS_ASSETS, OUTETTS_BACKBONE, OUTETTS_VOCODER, OUTETTS_SAMPLE_RATE } from './models';
import logger from '../../../../utils/logger';

export class OuteTTSEngine
  extends OnDeviceEngineEmitter<TTSEngineEvents>
  implements TTSEngine
{
  readonly id = 'outetts';
  readonly displayName = 'OuteTTS 0.3';
  readonly capabilities: TTSEngineCapabilities = {
    streaming: false,
    voiceCloning: true,
    pauseResume: true,
    generateAndSave: true,
    peakRamMB: 530,
  };

  private _phase: EnginePhase = 'idle';
  private _context: LlamaContext | null = null;
  private _isVocoderReady = false;
  private _contextLoadPromise: Promise<void> = Promise.resolve();
  private _audioCtx: AudioContext | null = null;
  private _currentSource: AudioBufferSourceNode | null = null;
  private _isSpeakingFlag = false;
  private _currentMessageId: string | null = null;
  private _playSessionId = 0;
  private _assetStates: ModelAssetState[] = [];

  constructor() {
    super();
    this._assetStates = OUTETTS_ASSETS.map(asset => ({
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
    return `${RNFS.DocumentDirectoryPath}/tts-models`;
  }

  private _getAssetPath(asset: ModelAsset): string {
    return `${this._getModelsDir()}/${asset.filename}`;
  }

  private _getAudioCacheDir(conversationId: string): string {
    return `${RNFS.DocumentDirectoryPath}/audio-cache/${conversationId}`;
  }

  private _getAudioFilePath(conversationId: string, messageId: string): string {
    return `${this._getAudioCacheDir(conversationId)}/${messageId}.pcm`;
  }

  private async _ensureDir(dir: string): Promise<void> {
    if (!(await RNFS.exists(dir))) {
      await RNFS.mkdir(dir);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  isSupported(): boolean {
    return true; // OuteTTS runs on all platforms via llama.rn
  }

  async initialize(): Promise<void> {
    if (this._context && this._isVocoderReady) return;
    if (this._phase === 'loading') return this._contextLoadPromise;

    this._setPhase('loading');

    this._contextLoadPromise = this._contextLoadPromise.then(async () => {
      if (this._context && this._isVocoderReady) return;

      logger.log('[OuteTTSEngine] Loading backbone...');
      this._context = await initLlama({
        model: this._getAssetPath(OUTETTS_BACKBONE),
        n_ctx: 8192,
        n_threads: 4,
      });

      logger.log('[OuteTTSEngine] Loading vocoder...');
      await this._context.initVocoder({
        path: this._getAssetPath(OUTETTS_VOCODER),
        n_batch: 4096,
      });
      this._isVocoderReady = await this._context.isVocoderEnabled();

      if (!this._isVocoderReady) {
        throw new Error('Vocoder failed to initialize.');
      }
      logger.log('[OuteTTSEngine] Ready.');
    });

    try {
      await this._contextLoadPromise;
      this._setPhase('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load OuteTTS';
      this._setPhase('error');
      this.emit('error', { code: 'OUTETTS_LOAD', message: msg, recoverable: true });
      throw err;
    }
  }

  async release(): Promise<void> {
    this.stop();
    if (this._context) {
      await this._context.releaseVocoder().catch(() => {});
      await this._context.release().catch(() => {});
      this._context = null;
    }
    this._isVocoderReady = false;
    this._audioCtx?.close().catch(() => {});
    this._audioCtx = null;
    this._setPhase('idle');
  }

  async destroy(): Promise<void> {
    await this.release();
    await this.deleteAssets();
  }

  // ── Assets ──────────────────────────────────────────────────────────────

  getRequiredAssets(): ModelAsset[] {
    return OUTETTS_ASSETS;
  }

  async checkAssetStatus(): Promise<ModelAssetState[]> {
    const states: ModelAssetState[] = [];
    for (const asset of OUTETTS_ASSETS) {
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
      ? OUTETTS_ASSETS.filter(a => assetIds.includes(a.id))
      : OUTETTS_ASSETS;

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

    // Stay in downloading until all done, then move to idle (not ready — need initialize())
    if (this.isFullyDownloaded()) {
      this._setPhase('idle');
    }
  }

  async deleteAssets(assetIds?: string[]): Promise<void> {
    await this.release();
    const toDelete = assetIds
      ? OUTETTS_ASSETS.filter(a => assetIds.includes(a.id))
      : OUTETTS_ASSETS;

    for (const asset of toDelete) {
      const path = this._getAssetPath(asset);
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
      this._updateAssetState(asset.id, { status: 'not-downloaded', progress: 0 });
    }
  }

  getOverallDownloadProgress(): number {
    const totalSize = OUTETTS_ASSETS.reduce((sum, a) => sum + a.sizeBytes, 0);
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
    return [
      {
        id: '0',
        label: 'Default',
        metadata: { gender: 'Neutral' },
      },
    ];
  }

  getActiveVoice(): TTSVoice | null {
    return this.getVoices()[0];
  }

  async setVoice(voiceId: string): Promise<void> {
    // OuteTTS only has one built-in voice; voice cloning uses referenceAudioPath
    this.emit('voiceChanged', voiceId);
  }

  // ── Audio Generation ────────────────────────────────────────────────────

  private async _generate(text: string): Promise<{
    samples: Float32Array;
    durationSeconds: number;
    sampleRate: number;
    waveformData: number[];
  }> {
    if (!this._context || !this._isVocoderReady) {
      throw new Error('OuteTTS models not loaded.');
    }

    const { prompt, grammar } = await this._context.getFormattedAudioCompletion(
      null, // default speaker
      text,
    );
    const guideTokens = (await this._context.getAudioCompletionGuideTokens(text)) ?? [];
    const result = await this._context.completion({
      prompt,
      grammar,
      guide_tokens: guideTokens,
      n_predict: 4096,
      temperature: 0.7,
      top_p: 0.9,
      stop: ['<|im_end|>'],
    });

    const pcmArray = await this._context.decodeAudioTokens(result.audio_tokens ?? []);
    const samples = new Float32Array(pcmArray);
    const sampleRate = OUTETTS_SAMPLE_RATE;

    return {
      samples,
      durationSeconds: samples.length / sampleRate,
      sampleRate,
      waveformData: this._buildWaveformData(samples, 200),
    };
  }

  // ── Speech ──────────────────────────────────────────────────────────────

  async speak(text: string, options?: TTSSpeakOptions): Promise<void> {
    if (!this._context || !this._isVocoderReady) {
      throw new Error('OuteTTS models not loaded. Call initialize() first.');
    }

    const speed = options?.speed ?? 1.0;
    const messageId = options?.messageId ?? null;

    this.stop();
    this._currentMessageId = messageId;
    const sessionId = ++this._playSessionId;
    this._isSpeakingFlag = true;
    this._setPhase('processing');

    try {
      // Truncate to keep generation time reasonable (~300 chars ~ 20-30s on device)
      const truncated = text.length > 300 ? `${text.slice(0, 297)}...` : text;
      const audio = await this._generate(truncated);

      // Abort if stop() was called or another speak() started during generation
      if (!this._isSpeakingFlag || this._playSessionId !== sessionId) return;

      this.emit('audioComplete', audio);
      await this._playFromSamples(audio.samples, speed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Speech failed';
      this.emit('error', { code: 'OUTETTS_SPEAK', message: msg, recoverable: true });
      throw err;
    } finally {
      if (this._playSessionId === sessionId) {
        this._currentMessageId = null;
        this._isSpeakingFlag = false;
        this._setPhase('ready');
      }
    }
  }

  // eslint-disable-next-line max-params
  async generateAndSave(
    text: string,
    conversationId: string,
    messageId: string,
    _options?: TTSSpeakOptions,
  ): Promise<TTSGenerateResult> {
    if (!this._context || !this._isVocoderReady) {
      throw new Error('OuteTTS models not loaded. Call initialize() first.');
    }

    const audio = await this._generate(text);
    this.emit('audioComplete', audio);

    // Save to file
    await this._ensureDir(this._getAudioCacheDir(conversationId));
    const filePath = this._getAudioFilePath(conversationId, messageId);
    const base64 = this._float32ToBase64(audio.samples);
    await RNFS.writeFile(filePath, base64, 'base64');

    return {
      filePath,
      durationSeconds: audio.durationSeconds,
      waveformData: audio.waveformData,
    };
  }

  async playFromFile(
    filePath: string,
    options?: { speed?: number; startOffset?: number; messageId?: string },
  ): Promise<void> {
    const speed = options?.speed ?? 1.0;
    const startOffset = options?.startOffset ?? 0;
    const messageId = options?.messageId ?? null;

    this.stop();
    this._currentMessageId = messageId;
    const sessionId = ++this._playSessionId;
    this._isSpeakingFlag = true;
    this._setPhase('processing');

    try {
      this._audioCtx?.close().catch(() => {});
      this._audioCtx = new AudioContext();
      const src = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
      const buffer = await this._audioCtx.decodeAudioData(src as unknown as ArrayBuffer);

      // Abort if stop() was called during decode
      if (this._playSessionId !== sessionId) return;

      const source = this._audioCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speed;
      source.connect(this._audioCtx.destination);
      this._currentSource = source;

      await new Promise<void>((resolve) => {
        source.onEnded = () => {
          this._currentSource = null;
          resolve();
        };
        source.start(0, startOffset);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Playback failed';
      this.emit('error', { code: 'OUTETTS_PLAYBACK', message: msg, recoverable: true });
      throw err;
    } finally {
      if (this._playSessionId === sessionId) {
        this._currentMessageId = null;
        this._isSpeakingFlag = false;
        this._setPhase('ready');
      }
    }
  }

  stop(): void {
    this._isSpeakingFlag = false;
    try { this._currentSource?.stop(); } catch { /* already stopped */ }
    this._currentSource = null;
    this._currentMessageId = null;
    if (this._phase === 'processing' || this._phase === 'paused') {
      this._setPhase(this._context ? 'ready' : 'idle');
    }
  }

  pause(): void {
    this._audioCtx?.suspend().catch(() => {});
    if (this._phase === 'processing') {
      this._setPhase('paused');
    }
  }

  resume(): void {
    this._audioCtx?.resume().catch(() => {});
    if (this._phase === 'paused') {
      this._setPhase('processing');
    }
  }

  // ── React Bridge ────────────────────────────────────────────────────────

  getBridgeComponent(): React.ComponentType | null {
    return null; // Fully imperative
  }

  // ── Audio Cache (app-level convenience) ─────────────────────────────────

  async getAudioCacheSizeMB(): Promise<number> {
    const cacheRoot = `${RNFS.DocumentDirectoryPath}/audio-cache`;
    if (!(await RNFS.exists(cacheRoot))) return 0;
    let totalBytes = 0;
    const convDirs = await RNFS.readDir(cacheRoot);
    for (const convDir of convDirs) {
      if (convDir.isDirectory()) {
        const files = await RNFS.readDir(convDir.path);
        for (const file of files) { totalBytes += Number(file.size); }
      }
    }
    return totalBytes / (1024 * 1024);
  }

  async clearAudioCache(): Promise<void> {
    const cacheRoot = `${RNFS.DocumentDirectoryPath}/audio-cache`;
    if (await RNFS.exists(cacheRoot)) {
      await RNFS.unlink(cacheRoot);
    }
  }

  async isAudioCached(conversationId: string, messageId: string): Promise<boolean> {
    return RNFS.exists(this._getAudioFilePath(conversationId, messageId));
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  private async _playFromSamples(samples: Float32Array, speed: number): Promise<void> {
    this._audioCtx?.close().catch(() => {});
    this._audioCtx = new AudioContext({ sampleRate: OUTETTS_SAMPLE_RATE });
    const buffer = this._audioCtx.createBuffer(1, samples.length, OUTETTS_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const source = this._audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speed;
    source.connect(this._audioCtx.destination);
    this._currentSource = source;

    await new Promise<void>((resolve, reject) => {
      // Guard against hanging promise if onEnded never fires
      const timeout = setTimeout(() => {
        this._currentSource = null;
        resolve();
      }, (samples.length / OUTETTS_SAMPLE_RATE / speed) * 1000 + 5000); // estimated duration + 5s buffer

      source.onEnded = () => {
        clearTimeout(timeout);
        this._currentSource = null;
        resolve();
      };
      try {
        source.start();
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  private _buildWaveformData(samples: Float32Array, points: number): number[] {
    const blockSize = Math.floor(samples.length / points);
    const result: number[] = [];
    for (let i = 0; i < points; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(samples[i * blockSize + j] ?? 0);
      }
      result.push(blockSize > 0 ? sum / blockSize : 0);
    }
    return result;
  }

  private _float32ToBase64(samples: Float32Array): string {
    const uint8 = new Uint8Array(samples.buffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }
}
