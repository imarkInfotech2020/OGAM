import { useEffect, useRef } from 'react';
import { canArmHandsFreeTurn } from '@offgrid/speech';
import { useAppStore, useChatStore } from '../../stores';
import { callHook, HOOKS } from '../../bootstrap/hookRegistry';
import { recordingController } from '../../services/recordingController';
import logger from '../../utils/logger';

/**
 * When hands-free opens the microphone again.
 *
 * Its own hook because it is its own question. useSilenceEndpoint decides when a turn ENDS; nothing
 * decided when the next one BEGINS, which is why hands-free was indistinguishable from tap-to-start -
 * the recorder only ever opened from a tap.
 *
 * A poll rather than an effect over state: the gating signals live in four different places and one of
 * them (whether the assistant is speaking) sits behind a pro hook that core cannot subscribe to. The
 * tick reads state and does nothing until every condition holds. The WHETHER is the shared pure
 * predicate in `@offgrid/speech`, so desktop reuses the decision and writes only its own tick.
 */

/** How often hands-free checks whether it may listen again. Immediate to a person, free to a CPU. */
const ARM_POLL_MS = 400;

export interface HandsFreeArming {
  /** A turn ended because the room went quiet, so the floor may come back automatically. */
  markEndedBySilence: () => void;
  /** Every stop path funnels here. A stop silence did not cause is deliberate, and suspends arming. */
  noteTurnStopped: () => void;
  /** Someone tapped for the floor: arming resumes. */
  resume: () => void;
}

export function useHandsFreeArming(opts: {
  /** Voice mode only. */
  isInAudioInterfaceMode: () => boolean;
  /** Transcription is still running, so the turn is not over. */
  isTranscribing: () => boolean;
  /** Opens the mic WITHOUT silencing the assistant - barge-in stops it on real speech instead. */
  startTurn: () => void;
}): HandsFreeArming {
  const endedBySilence = useRef(false);
  /** Latched by a deliberate stop. Without it the poll reopened the mic ~400ms after the stop button,
   *  so the button could never end the loop - it read as the app ignoring you. */
  const suspended = useRef(false);
  const isTranscribingRef = useRef(opts.isTranscribing);
  isTranscribingRef.current = opts.isTranscribing;
  const startRef = useRef(opts.startTurn);
  startRef.current = opts.startTurn;
  const inVoiceModeRef = useRef(opts.isInAudioInterfaceMode);
  inVoiceModeRef.current = opts.isInAudioInterfaceMode;

  useEffect(() => {
    const tick = setInterval(() => {
      if (suspended.current) return;
      const armable = canArmHandsFreeTurn({
        mode: useAppStore.getState().settings.voiceTurnMode ?? 'silence',
        inVoiceMode: inVoiceModeRef.current(),
        isRecording: recordingController.isRecording(),
        isTranscribing: isTranscribingRef.current(),
        isGenerating: useChatStore.getState().isStreaming,
        isAssistantSpeaking: callHook<boolean>(HOOKS.audioIsSpeaking) === true,
        // Both platforms ask the OS to subtract our own output from the mic - iOS via the videoChat
        // audio-session mode, Android via Oboe's VoiceCommunication input preset - so the mic can
        // stay open while the assistant talks without recording the assistant.
        echoCancelled: true,
      });
      if (!armable) return;
      logger.log('[VAD] hands-free: opening the mic for the next turn');
      startRef.current();
    }, ARM_POLL_MS);
    return () => clearInterval(tick);
  }, []);

  return {
    markEndedBySilence: () => { endedBySilence.current = true; },
    noteTurnStopped: () => {
      if (!endedBySilence.current) {
        suspended.current = true;
        logger.log('[VAD] stopped by hand - hands-free suspended until you tap');
      }
      endedBySilence.current = false;
    },
    resume: () => { suspended.current = false; },
  };
}
