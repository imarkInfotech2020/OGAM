/**
 * When has the speaker finished talking?
 *
 * Pure, and separate from WhisperService, because "the user has stopped speaking" is a decision and
 * everything around it is I/O. whisper.rn's `useVad` gates which slices get transcribed; it never
 * ends the session, so without this the only way to finish a voice turn is to press stop.
 *
 * The signal is the transcript itself. While someone is speaking, realtime slices keep changing the
 * text; when they stop, the text settles. That is a better end-of-speech marker than raw volume,
 * because it is already downstream of the VAD and of whisper's own decoding - a cough or a passing
 * car moves the meter but does not add words.
 */

/** How long the transcript must sit unchanged before the turn is treated as finished. */
export const AUTO_STOP_SILENCE_MS = 1_800;

/**
 * How long to wait when nothing has been said at all.
 *
 * Longer, deliberately: someone who taps record and then thinks for a moment has not finished, they
 * have not started. Ending that turn early would send an empty transcript and look like the button
 * was broken.
 */
export const AUTO_STOP_INITIAL_SILENCE_MS = 8_000;

export interface SpeechEndpointState {
  /** The last transcript seen, trimmed. Empty means nothing has been heard yet. */
  transcript: string;
  /** When that transcript last CHANGED. */
  changedAt: number;
}

export const initialSpeechEndpointState = (now: number): SpeechEndpointState => ({
  transcript: '',
  changedAt: now,
});

/**
 * Fold one realtime partial into the state.
 *
 * Only a real change moves the clock. Whisper re-emits the same text on every slice while the room
 * is quiet, so treating each event as activity would hold the turn open forever.
 */
export const observePartial = (
  state: SpeechEndpointState,
  partial: string,
  now: number,
): SpeechEndpointState => {
  const transcript = partial.trim();
  if (transcript === state.transcript) return state;
  return { transcript, changedAt: now };
};

/**
 * Has the turn ended?
 *
 * Two windows, because silence before speech and silence after it mean different things - see
 * AUTO_STOP_INITIAL_SILENCE_MS.
 */
export const hasSpeechEnded = (
  state: SpeechEndpointState,
  now: number,
): boolean => {
  const quietFor = now - state.changedAt;
  return state.transcript.length > 0
    ? quietFor >= AUTO_STOP_SILENCE_MS
    : quietFor >= AUTO_STOP_INITIAL_SILENCE_MS;
};

/** Milliseconds until the turn would end if nothing more is said. Used to schedule the check. */
export const msUntilSpeechEnds = (
  state: SpeechEndpointState,
  now: number,
): number => {
  const window =
    state.transcript.length > 0
      ? AUTO_STOP_SILENCE_MS
      : AUTO_STOP_INITIAL_SILENCE_MS;
  return Math.max(0, state.changedAt + window - now);
};
