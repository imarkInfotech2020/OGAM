/**
 * recordingController — the SINGLE owner of the voice-record lifecycle.
 *
 * Recording state used to be fragmented: `isDirectRecording` + `isAudioModeRecording`
 * in useVoiceInput, `isRecording` in useWhisperTranscription, and private flags in
 * the native services — with the hero mic able only to START (the old write-only
 * recordBridge). So tapping the hero mic again started a SECOND recording instead
 * of stopping, and the hero couldn't reflect the recording state at all.
 *
 * This controller is the one place that holds the record phase (the single source
 * of truth) and dispatches the start/stop/cancel intents. The recorder (useVoiceInput)
 * registers the concrete handlers and reports phase transitions; every mic — hero
 * and footer, on either platform — dispatches `toggle()` and reads the same phase.
 * No reactive snapshot to desync, no second start: toggle() decides from the
 * authoritative phase.
 *
 * It owns coordination + state, not the recording mechanics — those stay in the
 * recorder, which is injected via registerHandlers (DIP). Lives in core so the core
 * footer mic and the pro hero mic both depend on this one contract.
 */

/** Explicit record lifecycle. `transcribing` is the post-stop window (whisper running). */
/**
 * 'listening' is hands-free before anyone has spoken: the microphone is open, the turn has NOT begun.
 *
 * A distinct phase rather than a flag on 'recording', because the difference is user-visible - the
 * hero says "Listening" and offers to cancel, not "Recording - tap to stop" over an empty turn - and
 * this owner exists precisely so one truth drives every surface.
 */
export type RecordPhase = 'idle' | 'listening' | 'recording' | 'transcribing';

interface RecordingHandlers {
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
  cancel: () => void;
}

type Listener = (phase: RecordPhase) => void;

/** What the recorder reports. The phase is DERIVED from these and never written from outside. */
interface RecordingFacts {
  /** The recorder is open and capturing to a file. */
  recording: boolean;
  /** Hands-free: capturing, but nobody has spoken yet, so the turn has not begun. */
  awaitingSpeech: boolean;
  transcribing: boolean;
}

class RecordingController {
  private phase: RecordPhase = 'idle';
  private facts: RecordingFacts = { recording: false, awaitingSpeech: false, transcribing: false };
  private handlers: RecordingHandlers | null = null;
  private readonly listeners = new Set<Listener>();

  /** The active recorder registers its concrete start/stop/cancel. Returns an
   *  unregister fn (call on unmount) so a stale recorder never receives intents. */
  registerHandlers(handlers: RecordingHandlers): () => void {
    this.handlers = handlers;
    return () => {
      if (this.handlers === handlers) this.handlers = null;
    };
  }

  getPhase(): RecordPhase {
    return this.phase;
  }

  isRecording(): boolean {
    // Listening counts: the microphone IS open, so anything asking "are we capturing" must say yes -
    // otherwise a second tap starts a second recording, which is the bug this owner exists to stop.
    return this.phase === 'recording' || this.phase === 'listening';
  }

  /**
   * The recorder reports FACTS; this owner derives the phase from them.
   *
   * It used to take a phase directly, and two callers each computed one - the endpoint wrote
   * listening/recording while the recorder wrote all four - so they disagreed and whoever ran last
   * won. Facts cannot disagree: they are different fields.
   */
  report(update: Partial<RecordingFacts>): void {
    this.facts = { ...this.facts, ...update };
    const derived = this.derive();
    if (derived === this.phase) return;
    this.phase = derived;
    for (const l of this.listeners) l(derived);
  }

  private derive(): RecordPhase {
    // Awaiting speech wins over recording: hands-free opens the recorder BEFORE the turn begins, so
    // `recording` is already true while nobody has spoken, and saying "recording" then would tell
    // someone their words are being captured before anything is listening for them.
    if (this.facts.awaitingSpeech) return 'listening';
    if (this.facts.recording) return 'recording';
    if (this.facts.transcribing) return 'transcribing';
    return 'idle';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Start recording if idle. Decision is made from the authoritative phase. */
  start(): void {
    if (this.phase !== 'idle' || !this.handlers) return;
    void this.handlers.start();
  }

  /** Stop the in-flight recording. Listening counts: the mic is open, so stop must reach it -
   *  toggle() offered to stop a listening turn and this refused it. */
  stop(): void {
    if (!this.isRecording() || !this.handlers) return;
    void this.handlers.stop();
  }

  /** The uniform mic action: stop when recording, start when idle. This is what
   *  every mic (hero + footer) dispatches, so a second tap stops instead of
   *  starting a second recording (the hero tap-to-stop bug). Ignored while
   *  transcribing (the stop already happened). */
  toggle(): void {
    if (this.phase === 'recording' || this.phase === 'listening') this.stop();
    else if (this.phase === 'idle') this.start();
  }

  cancel(): void {
    if (!this.handlers) return;
    this.handlers.cancel();
  }

  /** Test helper. */
  _reset(): void {
    this.phase = 'idle';
    this.handlers = null;
    this.listeners.clear();
  }
}

export const recordingController = new RecordingController();
