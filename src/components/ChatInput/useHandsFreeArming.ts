import { useEffect, useRef } from 'react';
import { SPEAKER_DRAIN_MS } from '@offgrid/speech';
import { useAppStore } from '../../stores';
import { conversationFloor } from '../../services/conversationFloor';
import logger from '../../utils/logger';

/**
 * Hands-free: open the mic the moment the conversation comes back to the person.
 *
 * A LISTENER on the conversation floor, not a timer. This used to poll every 400ms and ask four
 * separate questions - is anything streaming, is anything speaking, is anything transcribing, is the
 * mic open - then act if all four were quiet in the same instant. Between generation finishing and
 * speech beginning all four ARE quiet, so it opened the mic and the assistant spoke into it, where its
 * own voice read as the person interrupting. Settle-ticks and an abandon guard were added for that
 * window; both were symptoms of asking four questions instead of having one answer.
 *
 * `conversationFloor` holds the floor continuously across the whole of the assistant's turn -
 * transcribing, generating and speaking are one stretch - so the "free" event fires once, when the turn
 * is genuinely over. Nothing is guessed, so nothing needs settling: there is no delay in this file.
 */

export interface HandsFreeArming {
  /** A turn ended because the room went quiet, so the floor may come back automatically. */
  markEndedBySilence: () => void;
  /** Every stop path funnels here. A stop silence did not cause is deliberate, and suspends arming. */
  noteTurnStopped: () => void;
  /** Someone tapped for the floor: arming resumes. */
  resume: () => void;
}

export function useHandsFreeArming(opts: {
  /** Voice mode only - chat dictation must never open its own mic. */
  isInAudioInterfaceMode: () => boolean;
  /** Opens the mic for a turn nobody asked for out loud yet. */
  startTurn: () => void;
}): HandsFreeArming {
  const endedBySilence = useRef(false);
  /** Latched by a deliberate stop. Without it the mic reopened straight after the stop button, so the
   *  button could never end the loop - it read as the app ignoring you. */
  const suspended = useRef(false);
  const startRef = useRef(opts.startTurn);
  startRef.current = opts.startTurn;
  const inVoiceModeRef = useRef(opts.isInAudioInterfaceMode);
  inVoiceModeRef.current = opts.isInAudioInterfaceMode;

  /** Pending drain wait, cancelled the moment anyone takes the floor back. */
  const drainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cancelDrain = (): void => {
      if (drainTimer.current) clearTimeout(drainTimer.current);
      drainTimer.current = null;
    };
    const unsubscribe = conversationFloor.subscribe(holder => {
      // Anyone taking the floor cancels a pending open - including the assistant starting a new
      // sentence during the drain, which is exactly when the mic must NOT appear.
      cancelDrain();
      if (holder !== 'idle') return;
      if (suspended.current) return;
      if (!inVoiceModeRef.current()) return;
      if ((useAppStore.getState().settings.voiceTurnMode ?? 'silence') !== 'handsfree') return;
      // Let the speaker drain first: the engine reports stopped before the sound has left the room,
      // and without echo cancellation the mic would capture the assistant's own tail as a question.
      drainTimer.current = setTimeout(() => {
        drainTimer.current = null;
        if (!conversationFloor.isFree()) return; // taken while we waited
        logger.log('[VAD] floor is free and drained - hands-free opening the mic');
        startRef.current();
      }, SPEAKER_DRAIN_MS);
    });
    return () => {
      cancelDrain();
      unsubscribe();
    };
  }, []);

  return {
    markEndedBySilence: () => {
      endedBySilence.current = true;
    },
    noteTurnStopped: () => {
      if (!endedBySilence.current) {
        suspended.current = true;
        logger.log('[VAD] stopped by hand - hands-free suspended until you tap');
      }
      endedBySilence.current = false;
    },
    resume: () => {
      suspended.current = false;
    },
  };
}
