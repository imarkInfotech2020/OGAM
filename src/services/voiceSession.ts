import {
  initialVoiceSession,
  micShouldBeOpen,
  nextVoiceSession,
  speechMayPlay,
  type VoiceSession,
  type VoiceSessionEvent,
} from '@offgrid/speech';
import { useAppStore } from '../stores';
import logger from '../utils/logger';

/**
 * The one owner of "what is this voice session doing": listening, speaking, or stopped.
 *
 * The machine is in `@offgrid/speech` because a spoken turn is not a mobile idea - desktop has the
 * same three states. This holds the single instance, asks the store which mode is selected, and tells
 * everyone when the state changes.
 *
 * ONE owner on purpose. What this replaces kept the same truth in several places at once - a lock with
 * tokens, a derived floor, a per-hook `suspended` ref, an `awaitingSpeech` flag, a `replyInFlight`
 * boolean in the pro feature - and they drifted apart. Every deadlock came from two of them
 * disagreeing, and each one had to be found on a device.
 *
 * Anything that wants to open a microphone or play audio ASKS here. Nothing keeps its own copy.
 */

type Listener = (session: VoiceSession) => void;

const listeners = new Set<Listener>();

/** Read at every transition, so changing the setting takes effect on the next event. */
const handsFree = (): boolean =>
  (useAppStore.getState().settings.voiceTurnMode ?? 'silence') === 'handsfree';

let session: VoiceSession = initialVoiceSession(handsFree());

export const voiceSession = {
  current: (): VoiceSession => session,

  /** The microphone may be open only while listening. */
  micShouldBeOpen: (): boolean => micShouldBeOpen(session),

  /** Audio may play only while speaking - so a reply after a stop stays silent. */
  speechMayPlay: (): boolean => speechMayPlay(session),

  /**
   * Apply an event. Silent when nothing changes, so the log shows real transitions only.
   *
   * Every transition is logged with its cause: a state that is wrong is always wrong because of the
   * event that produced it, and the state alone cannot say which.
   */
  dispatch(event: VoiceSessionEvent): void {
    const before = session.state;
    session = nextVoiceSession(session, event, handsFree());
    if (session.state === before) {
      logger.log(`[SESSION] ${before} unchanged by ${event}`);
      return;
    }
    logger.log(`[SESSION] ${before} -> ${session.state} (${event})`);
    for (const listener of listeners) listener(session);
  },

  /** Test helper: module state outlives a test file, so each test needs a clean session. */
  _resetForTesting(): void {
    session = initialVoiceSession(handsFree());
    listeners.clear();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
