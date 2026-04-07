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

export const kokoroRef = {
  speak: (text: string, speed = 1.0): Promise<void> =>
    _streamFn ? _streamFn(text, speed) : Promise.resolve(),
  stop: (instant = true) => _stopFn?.(instant),
};

// ─── Component ────────────────────────────────────────────────────────────────

export const KokoroTTSManager: React.FC = () => {
  const kokoroVoiceId = useTTSStore(s => s.settings.kokoroVoiceId) as KokoroVoiceId;
  const audioCtxRef = useRef<AudioContext | null>(null);

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
    // Reuse or create AudioContext
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = audioCtxRef.current;

    try {
      await tts.stream({
        text,
        speed,
        onNext: (chunk: Float32Array) =>
          new Promise<void>((resolve) => {
            // Read speed fresh on each chunk so live speed changes take effect immediately
            const currentSpeed = useTTSStore.getState().settings.speed;
            const buffer = ctx.createBuffer(1, chunk.length, 24000);
            buffer.copyToChannel(chunk, 0);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = currentSpeed;
            source.connect(ctx.destination);
            source.onEnded = () => resolve();
            source.start();
          }),
        onEnd: async () => {
          await ctx.suspend().catch(() => {});
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
