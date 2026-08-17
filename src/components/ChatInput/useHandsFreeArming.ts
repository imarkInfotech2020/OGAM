import { useEffect, useRef } from 'react';
import { canArmHandsFreeTurn } from '@offgrid/speech';
import { useAppStore, useChatStore } from '../../stores';
import { callHook, HOOKS } from '../../bootstrap/hookRegistry';
import { recordingController } from '../../services/recordingController';
import { audioRecorderService } from '../../services/audioRecorderService';
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

/**
 * How many consecutive quiet ticks before the mic opens.
 *
 * There is a GAP between generation finishing and speech beginning - nothing is streaming and nothing
 * is playing yet - and a single-tick check walked straight through it, opened the mic, and then the
 * assistant started talking into it. Requiring the quiet to persist closes that window, at the cost of
 * about a second before the mic opens. A person waiting for their turn does not notice; an assistant
 * being cut off by its own voice is unusable.
 */
const SETTLE_TICKS = 4;

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
  /** Opens the mic for a turn nobody asked for out loud yet. */
  startTurn: () => void;
  /** Throw away an open turn. Used when the assistant starts speaking into a waiting mic: there is
   *  nothing worth keeping, and keeping it would transcribe the assistant as the person. */
  abandonTurn: () => void;
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
  const abandonRef = useRef(opts.abandonTurn);
  abandonRef.current = opts.abandonTurn;
  const quietTicks = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => {
      if (suspended.current) return;
      const assistantSpeaking = callHook<boolean>(HOOKS.audioIsSpeaking) === true;

      // The assistant started talking into a mic that was still waiting for the person. Close it:
      // without echo cancellation those buffers are the assistant, and treating them as speech is
      // what cut the assistant off mid-sentence. It re-opens once the assistant has finished.
      if (assistantSpeaking && recordingController.getPhase() === 'listening') {
        logger.log('[VAD] assistant is speaking - closing the waiting mic until it finishes');
        quietTicks.current = 0;
        abandonRef.current();
        return;
      }

      const armable = canArmHandsFreeTurn({
        mode: useAppStore.getState().settings.voiceTurnMode ?? 'silence',
        inVoiceMode: inVoiceModeRef.current(),
        isRecording: recordingController.isRecording(),
        isTranscribing: isTranscribingRef.current(),
        isGenerating: useChatStore.getState().isStreaming,
        isAssistantSpeaking: assistantSpeaking,
        // Asked, not assumed: the recorder owns how capture is configured on this platform, so a
        // session mode changed back cannot leave this claiming a cancellation that is not there.
        echoCancelled: audioRecorderService.isEchoCancelled(),
      });
      if (!armable) {
        quietTicks.current = 0;
        return;
      }
      // Quiet has to HOLD. One quiet reading is the gap between generation and speech.
      quietTicks.current += 1;
      if (quietTicks.current < SETTLE_TICKS) return;
      quietTicks.current = 0;
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
