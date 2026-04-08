/**
 * KokoroTTSManager
 *
 * Mounts the react-native-executorch useTextToSpeech hook and exposes its
 * speak/stop methods via module-level refs so they can be called from the
 * ttsStore without a React context dependency.
 *
 * Mount exactly once, near the root (App.tsx), only on supported platforms.
 * On Android <26 / iOS <17 this component should not be rendered at all.
 */
import React, { useEffect, useRef } from 'react';
import { useTextToSpeech } from 'react-native-executorch';
import { AudioContext } from 'react-native-audio-api';
import { useTTSStore } from '../stores/ttsStore';
import { KOKORO_MEDIUM, getKokoroVoiceConfig } from '../constants/kokoroModels';
import type { KokoroVoiceId } from '../constants/kokoroModels';
import logger from '../utils/logger';

// ─── Module-level refs (callable from ttsStore without React context) ─────────

let _streamFn: ((text: string, speed: number) => Promise<void>) | null = null;
let _stopFn: ((instant?: boolean) => void) | null = null;
let _audioCtxRef: { current: AudioContext | null } = { current: null };
// Pending onNext resolvers — force-resolved on stop so isSpeaking is always cleared
const _pendingResolvers: Set<() => void> = new Set();
// When true, onEnd skips ctx.suspend() so the next chunk can start cleanly
let _skipSuspendOnEnd = false;

export const kokoroRef = {
  speak: (text: string, speed = 1.0): Promise<void> =>
    _streamFn ? _streamFn(text, speed) : Promise.resolve(),
  /** Call before sequential chunks to prevent AudioContext suspension between them */
  setKeepAlive: (keepAlive: boolean) => { _skipSuspendOnEnd = keepAlive; },
  stop: (instant = true) => {
    _pendingResolvers.forEach((resolve) => resolve());
    _pendingResolvers.clear();
    _stopFn?.(instant);
  },
  /** Pause playback — suspends AudioContext, Kokoro waits for onNext to resolve */
  pause: () => { _audioCtxRef.current?.suspend().catch(() => {}); },
  /** Resume playback — AudioContext resumes, current chunk finishes, Kokoro continues */
  resume: () => { _audioCtxRef.current?.resume().catch(() => {}); },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const KokoroTTSManager: React.FC = () => {
  const kokoroVoiceId = useTTSStore(s => s.settings.kokoroVoiceId) as KokoroVoiceId;
  const audioCtxRef = useRef<AudioContext | null>(null);
  _audioCtxRef = audioCtxRef; // Expose to module-level kokoroRef for pause/resume

  const tts = useTextToSpeech({
    model: KOKORO_MEDIUM,
    voice: getKokoroVoiceConfig(kokoroVoiceId),
  });

  // Sync isReady + downloadProgress into ttsStore
  useEffect(() => {
    useTTSStore.getState().setKokoroState(tts.isReady, tts.downloadProgress);
  }, [tts.isReady, tts.downloadProgress]);

  // If executorch reports an error (e.g. unsupported device at runtime), mark Kokoro unavailable
  useEffect(() => {
    if (tts.error) {
      logger.warn('[Kokoro] Runtime error — falling back to OuteTTS:', tts.error);
      useTTSStore.getState().setKokoroState(false, 0);
    }
  }, [tts.error]);

  // Keep module refs pointing to the latest hook functions on every render
  _streamFn = async (text: string, speed: number) => {
    // Reuse or create AudioContext — always resume in case it was suspended after last playback
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
    } else if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }
    const ctx = audioCtxRef.current;

    try {
      await tts.stream({
        text,
        speed,
        onNext: (chunk: Float32Array) =>
          new Promise<void>((resolve) => {
            // Track this resolver so stop() can force-resolve it if AudioContext closes mid-chunk
            _pendingResolvers.add(resolve);
            const done = () => { _pendingResolvers.delete(resolve); resolve(); };

            // Signal that audio is actually playing (first chunk received)
            useTTSStore.getState().setAudioPlaying(true);

            // Compute RMS amplitude for waveform sync (speech typically 0.01–0.3; scale ×8 to 0–1)
            let sumSq = 0;
            for (let i = 0; i < chunk.length; i++) { sumSq += chunk[i] * chunk[i]; }
            const rms = Math.min(1, Math.sqrt(sumSq / chunk.length) * 8);
            // Floor at 0.15 so bars never fully collapse during natural speech pauses
            useTTSStore.getState().setCurrentAmplitude(Math.max(0.15, rms));

            // Track elapsed playback time (chunk samples / sampleRate / speed)
            const currentSpeed = useTTSStore.getState().settings.speed;
            const chunkDuration = chunk.length / 24000 / currentSpeed;
            useTTSStore.getState().addPlaybackElapsed(chunkDuration);

            // Read speed fresh on each chunk so live speed changes take effect immediately
            const buffer = ctx.createBuffer(1, chunk.length, 24000);
            buffer.copyToChannel(chunk, 0);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = currentSpeed;
            source.connect(ctx.destination);
            source.onEnded = done;
            source.start();
          }),
        onEnd: async () => {
          // Skip suspend if more chunks are queued (keepAlive mode)
          if (!_skipSuspendOnEnd) {
            await ctx.suspend().catch(() => {});
          }
        },
      });
    } catch (err) {
      logger.error('[Kokoro] stream error:', err);
      throw err;
    }
  };

  _stopFn = (instant = true) => {
    tts.streamStop(instant);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  return null;
};
