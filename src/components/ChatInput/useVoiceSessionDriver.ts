import { useEffect, useRef } from 'react';
import { voiceSession } from '../../services/voiceSession';

/**
 * Open the microphone whenever the session says it should be listening.
 *
 * That is the entire responsibility. It replaces a hook that polled four separate signals, held a
 * `suspended` ref, scheduled a drain timer and tried to guess when a turn was over - all of which
 * existed because nothing owned the answer. The session owns it now, so this only has to obey.
 */
export function useVoiceSessionDriver(opts: { startTurn: () => void }): void {
  const startRef = useRef(opts.startTurn);
  startRef.current = opts.startTurn;

  useEffect(() => {
    // Fires on every transition INTO listen - a fresh hands-free session, a reply finishing, or the
    // person tapping start after a stop.
    const stop = voiceSession.subscribe(session => {
      if (session.state === 'listen') startRef.current();
    });
    // The session may ALREADY be listening when this mounts (hands-free starts there), and a state
    // that never changes produces no event. Checking once is what makes entering the mode work.
    if (voiceSession.micShouldBeOpen()) startRef.current();
    return stop;
  }, []);
}
