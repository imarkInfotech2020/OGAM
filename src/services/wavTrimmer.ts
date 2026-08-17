import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { WAV_HEADER_BYTES, WAV_HEADER_SCAN_BYTES, planWavTrim } from '@offgrid/speech';
import logger from '../utils/logger';

/**
 * Cut the dead air off the front of a recording, in place.
 *
 * Hands-free opens the microphone before anyone speaks, so the first word is never clipped - loudness
 * only tells you speech began about 300ms AFTER it began, so a recorder that waits for detection
 * always starts mid-word. The cost is a note that opens with however long the person took to start,
 * and voice notes here play back and sync, so that silence is not cosmetic.
 *
 * This is the I/O half only. WHERE to cut is `planWavTrim` in `@offgrid/speech` - pure, shared with
 * desktop, and tested on real WAV bytes. This file reads, writes and swaps.
 *
 * Failure is always non-fatal: on any problem the original file is left exactly as it was. A note with
 * silence at the front is a blemish; a note we corrupted while tidying is lost audio.
 */

/**
 * Bytes per copied chunk.
 *
 * A multiple of 3 so each chunk's base64 has no interior padding (concatenated at byte offsets, a
 * padded chunk would shift everything after it), and even so a 16-bit frame is never split.
 */
const COPY_CHUNK_BYTES = 3 * 64 * 1024;

export async function trimWavFront(path: string, keepFromSeconds: number): Promise<boolean> {
  if (!Number.isFinite(keepFromSeconds) || keepFromSeconds <= 0) return false;

  const temporary = `${path}.trim`;
  try {
    const info = await RNFS.stat(path);
    const fileBytes = Number(info.size);
    const head = new Uint8Array(
      Buffer.from(await RNFS.read(path, WAV_HEADER_SCAN_BYTES, 0, 'base64'), 'base64'),
    );

    const plan = planWavTrim(head, keepFromSeconds, fileBytes);
    if (!plan) {
      // Says WHICH nothing happened: an unreadable header, nothing worth dropping, or a trim that
      // would have left no audio. Without it a note that kept its silence looks like a trim that ran.
      logger.log(`[VAD] trim skipped (nothing to cut in ${fileBytes}B, wanted ${keepFromSeconds.toFixed(2)}s)`);
      return false;
    }

    await RNFS.writeFile(temporary, Buffer.from(plan.header).toString('base64'), 'base64');

    let copied = 0;
    while (copied < plan.copyBytes) {
      const length = Math.min(COPY_CHUNK_BYTES, plan.copyBytes - copied);
      const chunk = await RNFS.read(path, length, plan.copyFrom + copied, 'base64');
      await RNFS.write(temporary, chunk, WAV_HEADER_BYTES + copied, 'base64');
      copied += length;
    }

    // Swap last, so an interruption anywhere above leaves the original untouched.
    await RNFS.unlink(path);
    await RNFS.moveFile(temporary, path);
    logger.log(`[VAD] trimmed ${plan.droppedSeconds.toFixed(2)}s of silence off the front`);
    return true;
  } catch (error) {
    await RNFS.unlink(temporary).catch(() => undefined);
    logger.warn('[VAD] trim failed, keeping the original recording', error);
    return false;
  }
}
