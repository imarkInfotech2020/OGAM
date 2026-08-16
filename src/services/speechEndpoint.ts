/**
 * When has the speaker finished talking?
 *
 * Decided from the AUDIO, not from the transcript.
 *
 * The first version of this watched the transcript settle, and it does not work. Whisper's realtime
 * mode re-decodes the whole accumulated buffer on every 3s slice, so the text keeps shifting while
 * the room is silent - punctuation moves, a word gets corrected - and "the transcript stopped
 * changing" never becomes true. It passed on a short clean phrase in a quiet room and failed on real
 * speech, which is the worst way for a check to be wrong.
 *
 * whisper.rn's own `useVad` does not end a turn either. In `rn-whisper.cpp`, `vad_simple` only gates
 * whether a slice gets DECODED, and `vad()` returns true outright whenever transcription is already
 * running. Nothing in the native path stops the recorder, so the decision has to be made here.
 *
 * So this listens to the microphone's loudness - an RMS per buffer from audioRecorderService, which
 * already runs alongside the realtime transcription - and ends the turn when the room goes quiet.
 */

/** Silence after speech. Short, because this can only fire once someone has actually spoken. */
const SILENCE_AFTER_SPEECH_MS = 1_500;

/**
 * How long to wait when nothing has been said at all.
 *
 * Longer, deliberately: someone who taps record and then thinks for a moment has not finished, they
 * have not started. Ending that turn early sends an empty transcript and looks like a broken button.
 */
const SILENCE_BEFORE_SPEECH_MS = 8_000;

/**
 * How far above the noise floor counts as speech.
 *
 * Relative rather than absolute: a phone on a desk in a quiet room and the same phone in a cafe have
 * very different floors, and one fixed number cannot serve both. The additive margin stops a silent
 * room, where the floor sits near zero, from hearing its own hiss as speech.
 */
const SPEECH_OVER_FLOOR = 3;
const SPEECH_FLOOR_MARGIN = 0.006;

/** The floor follows quiet quickly and loud slowly, so a long sentence cannot drag it up into speech. */
const FLOOR_FALL = 0.25;
const FLOOR_RISE = 0.02;

/** How often the turn is re-checked. Silence delivers buffers too, but a device that stops
 *  delivering them entirely would otherwise never re-evaluate and never end the turn. */
const CHECK_EVERY_MS = 250;

export interface SpeechEndpointReading {
  /** Whether this buffer sounded like speech. */
  speech: boolean;
  /** The adapting noise floor, exposed so a decision can be explained. */
  floor: number;
}

/**
 * Hears the room and decides when the turn is over.
 *
 * Separate from WhisperService because ending a turn is a decision about audio, and the service is
 * about transcription. The timer lives with the state that justifies it, so a stale timer cannot
 * fire against fresh state.
 */
export class SpeechEndpointTimer {
  private floor: number | null = null;
  private heardSpeech = false;
  private lastSpeechAt = 0;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ended = true;

  constructor(private readonly onEnded: () => void) {}

  /** A turn has started. Nothing has been heard yet. */
  begin(now: number = Date.now()): void {
    this.floor = null;
    this.heardSpeech = false;
    this.lastSpeechAt = 0;
    this.startedAt = now;
    this.ended = false;
    this.clear();
    this.timer = setInterval(() => this.check(Date.now()), CHECK_EVERY_MS);
  }

  /** One buffer of microphone loudness. */
  observeLevel(rms: number, now: number = Date.now()): SpeechEndpointReading {
    if (!Number.isFinite(rms) || rms < 0) return { speech: false, floor: this.floor ?? 0 };
    if (this.floor === null) this.floor = rms;
    const alpha = rms < this.floor ? FLOOR_FALL : FLOOR_RISE;
    this.floor += alpha * (rms - this.floor);

    const speech = rms > this.floor * SPEECH_OVER_FLOOR + SPEECH_FLOOR_MARGIN;
    if (speech) {
      this.heardSpeech = true;
      this.lastSpeechAt = now;
    }
    return { speech, floor: this.floor };
  }

  /** Whether the turn should end now. Public so it can be checked without waiting on a timer. */
  hasEnded(now: number = Date.now()): boolean {
    return this.heardSpeech
      ? now - this.lastSpeechAt >= SILENCE_AFTER_SPEECH_MS
      : now - this.startedAt >= SILENCE_BEFORE_SPEECH_MS;
  }

  /** True once speech has been heard at all - the difference between "paused" and "never started". */
  hasHeardSpeech(): boolean {
    return this.heardSpeech;
  }

  /** Forget the turn. Called whenever transcription stops, however it stopped. */
  cancel(): void {
    this.clear();
    this.ended = true;
  }

  private check(now: number): void {
    if (this.ended || !this.hasEnded(now)) return;
    this.ended = true;
    this.clear();
    this.onEnded();
  }

  private clear(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
