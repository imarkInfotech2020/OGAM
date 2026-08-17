import { createConversationFloor } from '@offgrid/speech';
import logger from '../utils/logger';

/**
 * This app's conversation floor: who holds the turn, the assistant or the person.
 *
 * The state machine lives in `@offgrid/speech` because serializing speak-and-listen is not a mobile
 * idea - desktop has the same one resource with the same one holder. What differs is only who reports
 * into it: here the recorder reports the mic and transcription, the chat store reports generation, and
 * the pro audio feature reports speech.
 *
 * One instance per app, created here so every reporter and listener shares the same floor.
 */
export const conversationFloor = createConversationFloor(line => logger.log(line));
