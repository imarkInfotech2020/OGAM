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
const AUTO_STOP_SILENCE_MS = 1_800;

/**
 * How long to wait when nothing has been said at all.
 *
 * Longer, deliberately: someone who taps record and then thinks for a moment has not finished, they
 * have not started. Ending that turn early would send an empty transcript and look like the button
 * was broken.
 */
const AUTO_STOP_INITIAL_SILENCE_MS = 8_000;

interface SpeechEndpointState {
  /** The last transcript seen, trimmed. Empty means nothing has been heard yet. */
  transcript: string;
  /** When that transcript last CHANGED. */
  changedAt: number;
}

const initialSpeechEndpointState = (now: number): SpeechEndpointState => ({
  transcript: '',
  changedAt: now,
});

/**
 * Fold one realtime partial into the state.
 *
 * Only a real change moves the clock. Whisper re-emits the same text on every slice while the room
 * is quiet, so treating each event as activity would hold the turn open forever.
 */
const observePartial = (
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
const hasSpeechEnded = (
  state: SpeechEndpointState,
  now: number,
): boolean => {
  const quietFor = now - state.changedAt;
  return state.transcript.length > 0
    ? quietFor >= AUTO_STOP_SILENCE_MS
    : quietFor >= AUTO_STOP_INITIAL_SILENCE_MS;
};

/**
 * The endpoint decision plus the one timer that acts on it.
 *
 * Owned here rather than in WhisperService because ending a turn is about time, and the service is
 * about transcription. It also keeps the timer and the state that justifies it in the same place -
 * split across two objects, a stale timer firing against fresh state is the obvious bug.
 */
export class SpeechEndpointTimer {
  private state: SpeechEndpointState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onEnded: () => void) {}

  /**
   * Fold in one realtime partial and re-arm.
   *
   * Re-armed on change rather than scheduled once, because the window restarts each time the speaker
   * adds a word. When nothing changed the existing timer is already counting the right window down,
   * so it is left alone.
   */
  observe(partial: string): void {
    const now = Date.now();
    const next = observePartial(this.state ?? initialSpeechEndpointState(now), partial, now);
    const unchanged = this.state === next;
    this.state = next;
    if (unchanged && this.timer) return;
    this.clear();
    this.timer = setTimeout(() => {
      this.timer = null;
      // Re-checked at fire time: a partial can land between the last arm and now.
      if (!this.state || !hasSpeechEnded(this.state, Date.now())) return;
      this.onEnded();
    }, msUntilSpeechEnds(next, now));
  }

  /** Forget the turn. Called whenever transcription stops, however it stopped. */
  cancel(): void {
    this.clear();
    this.state = null;
  }

  private clear(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Milliseconds until the turn would end if nothing more is said. Used to schedule the check. */
const msUntilSpeechEnds = (
  state: SpeechEndpointState,
  now: number,
): number => {
  const window =
    state.transcript.length > 0
      ? AUTO_STOP_SILENCE_MS
      : AUTO_STOP_INITIAL_SILENCE_MS;
  return Math.max(0, state.changedAt + window - now);
};
