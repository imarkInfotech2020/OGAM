import { useEffect, useRef } from 'react';
import { voiceSession } from '../../services/voiceSession';
import { recordingController } from '../../services/recordingController';

/**
 * Obey the session's answer to "may a microphone be open right now".
 *
 * That is the entire responsibility. It replaces a hook that polled four separate signals, held a
 * `suspended` ref, scheduled a drain timer and tried to guess when a turn was over - all of which
 * existed because nothing owned the answer. The session owns it now, so this only has to obey -
 * in both directions: open the mic when the session listens, and cancel a recording the moment the
 * floor is seized out from under one.
 */
export function useVoiceSessionDriver(opts: { startTurn: () => void }): void {
  const startRef = useRef(opts.startTurn);
  startRef.current = opts.startTurn;

  useEffect(() => {
    // Fires on every transition INTO listen - a fresh hands-free session, a reply finishing, or the
    // person tapping start after a stop.
    const stop = voiceSession.subscribe(session => {
      if (session.state === 'listen') startRef.current();
      // A replay seizing the floor is the one exit from LISTEN the recorder does not drive itself:
      // stop and silence both flow through the recorder before the session moves. Cancel rather than
      // stop - pressing play on a saved message abandons the open turn, it does not finish it, so
      // there is nothing worth transcribing. Idempotent when nothing is recording.
      else if (session.replayReturnsTo) recordingController.cancel();
    });
    // The session may ALREADY be listening when this mounts (hands-free starts there), and a state
    // that never changes produces no event. Checking once is what makes entering the mode work.
    if (voiceSession.micShouldBeOpen()) startRef.current();
    return stop;
  }, []);
}
