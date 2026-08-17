import { createTurnLock, SPEAKER_DRAIN_MS } from '@offgrid/speech';
import logger from '../utils/logger';

/**
 * This app's lock on the one audio resource: speaking and listening, never both.
 *
 * The machine lives in `@offgrid/speech` because serialising a spoken turn is not a mobile idea -
 * desktop has the same single resource. What differs is only who acquires it: here the recorder takes
 * it for the person, and the pro audio feature takes it for a reply.
 *
 * The drain is configured ONCE, here, rather than remembered by each caller: a TTS engine reports
 * "stopped" before its last samples have left the speaker, and handing the mic straight over recorded
 * the assistant's tail as the person's next question.
 */
export const turnLock = createTurnLock({
  log: line => logger.log(line),
  releaseDelayMs: SPEAKER_DRAIN_MS,
});
