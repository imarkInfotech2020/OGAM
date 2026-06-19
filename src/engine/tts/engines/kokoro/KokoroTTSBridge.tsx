/**
 * KokoroTTSBridge
 *
 * React component that mounts the react-native-executorch useTextToSpeech
 * hook and registers imperative methods with the KokoroEngine instance.
 *
 * This replaces the old KokoroTTSManager. The key difference: instead of
 * exposing module-level refs, it pushes its handle into the engine instance
 * via engine._setBridge(). The engine owns the public API.
 *
 * Mount exactly once, near the root (via <EngineBridge />), only on
 * supported platforms.
 */
import React, { useEffect, useRef } from 'react';
import { useTextToSpeech } from 'react-native-executorch';
import { AudioContext } from 'react-native-audio-api';
import { KOKORO_MEDIUM } from 'react-native-executorch';
import { getKokoroVoiceConfig } from './voices';
import type { KokoroVoiceId } from './voices';
import type { KokoroEngine, KokoroBridgeHandle } from './KokoroEngine';
import logger from '../../../../utils/logger';

// ─── Inner component — holds the hook for a single voice ────────────────────

const KokoroTTSInner: React.FC<{
  voiceId: KokoroVoiceId;
  engine: KokoroEngine;
}> = ({ voiceId, engine }) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pendingResolvers = useRef<Set<() => void>>(new Set());
  const skipSuspendOnEnd = useRef(false);

  const tts = useTextToSpeech({
    model: KOKORO_MEDIUM,
    voice: getKokoroVoiceConfig(voiceId),
  });

  // Sync readiness + download progress into the engine
  useEffect(() => {
    logger.log('[KokoroBridge] isReady=', tts.isReady, 'downloadProgress=', tts.downloadProgress);
    engine._setDownloadProgress(tts.downloadProgress);
    if (tts.isReady) {
      // Register the bridge handle so the engine can call speak/stop/etc.
      const handle: KokoroBridgeHandle = {
        speak: async (text: string, speed: number) => {
          if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
          } else if (audioCtxRef.current.state === 'suspended') {
            await audioCtxRef.current.resume().catch(() => {});
          }
          const ctx = audioCtxRef.current;
          let chunkIndex = 0;

          try {
            await tts.stream({
              text,
              speed,
              onNext: (chunk: Float32Array) =>
                new Promise<void>((resolve) => {
                  pendingResolvers.current.add(resolve);
                  const done = () => {
                    pendingResolvers.current.delete(resolve);
                    resolve();
                  };

                  // Emit audioChunk event so listeners can react
                  engine._onAudioChunk({ samples: chunk, sampleRate: 24000, chunkIndex, isFinal: false });
                  chunkIndex++;

                  const buffer = ctx.createBuffer(1, chunk.length, 24000);
                  buffer.copyToChannel(chunk, 0);
                  const source = ctx.createBufferSource();
                  source.buffer = buffer;
                  source.playbackRate.value = speed;
                  source.connect(ctx.destination);
                  source.onEnded = done;
                  source.start();
                }),
              onEnd: async () => {
                // Emit final chunk marker
                engine._onAudioChunk({ samples: new Float32Array(0), sampleRate: 24000, chunkIndex, isFinal: true });
                if (!skipSuspendOnEnd.current) {
                  await ctx.suspend().catch(() => {});
                }
              },
            });
          } catch (err) {
            logger.error('[KokoroBridge] stream error:', err);
            throw err;
          }
        },

        stop: (instant = true) => {
          pendingResolvers.current.forEach((r) => r());
          pendingResolvers.current.clear();
          tts.streamStop(instant);
          audioCtxRef.current?.close().catch(() => {});
          audioCtxRef.current = null;
        },

        pause: () => {
          audioCtxRef.current?.suspend().catch(() => {});
        },

        resume: () => {
          audioCtxRef.current?.resume().catch(() => {});
        },

        setKeepAlive: (keepAlive: boolean) => {
          skipSuspendOnEnd.current = keepAlive;
        },
      };

      engine._setBridge(handle, voiceId);
    }
  }, [tts.isReady, tts.downloadProgress, voiceId, engine, tts]);

  useEffect(() => {
    if (tts.error) {
      logger.warn('[KokoroBridge] Runtime error:', tts.error);
      engine._onBridgeError(String(tts.error));
    }
  }, [tts.error, engine]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      logger.log('[KokoroBridge] Inner unmounting');
      engine._setBridge(null, voiceId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

// ─── Outer component — manages voice switching via key-based remount ────────

export function createKokoroTTSBridge(engine: KokoroEngine): React.FC {
  return function KokoroTTSBridgeOuter() {
    const [activeVoiceId, setActiveVoiceId] = React.useState<KokoroVoiceId>(
      (engine.getActiveVoice()?.id as KokoroVoiceId) ?? 'af_heart',
    );
    const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastStreamEndRef = useRef(0);

    // Listen for voice changes from the engine
    useEffect(() => {
      const unsub = engine.on('voiceChanged', (voiceId) => {
        const newVoice = voiceId as KokoroVoiceId;
        if (newVoice === activeVoiceId) return;

        // Cooldown before remount to let executorch clean up
        const elapsed = Date.now() - lastStreamEndRef.current;
        const waitMs = Math.max(100, 2000 - elapsed);

        logger.log('[KokoroBridge] Voice change cooldown:', waitMs, 'ms');
        engine._setDownloadProgress(0); // Show loader during switch

        if (cooldownRef.current) clearTimeout(cooldownRef.current);
        cooldownRef.current = setTimeout(() => {
          setActiveVoiceId(newVoice);
          cooldownRef.current = null;
        }, waitMs);
      });

      return () => {
        unsub();
        if (cooldownRef.current) clearTimeout(cooldownRef.current);
      };
    }, [activeVoiceId]);

    // Track stream end time for cooldown calculation
    useEffect(() => {
      const unsub = engine.on('phaseChange', (phase, prev) => {
        if (prev === 'processing' && (phase === 'ready' || phase === 'idle')) {
          lastStreamEndRef.current = Date.now();
        }
      });
      return unsub;
    }, []);

    return <KokoroTTSInner key={activeVoiceId} voiceId={activeVoiceId} engine={engine} />;
  };
}
