/**
 * AudioSessionManager — the single owner of the iOS AVAudioSession.
 *
 * Before this existed, the session was configured from two unrelated places (the
 * recorder set `playAndRecord`, the Kokoro TTS bridge set `playback`) with no
 * coordination and no restore, so whichever ran last decided the category — which
 * is why playback was sometimes silent (a `record`-only or stale session routes
 * AudioContext output nowhere on iOS). Every code path that needs the session now
 * goes through here, so there is exactly one owner of its category + activation.
 *
 * iOS-only: on Android there is no equivalent session to manage, so every method
 * is a no-op (the platform routes audio without app-level session activation).
 *
 * See docs/design/AUDIO_PLAYBACK_SERVICE.md.
 */
import { Platform } from 'react-native';
import { AudioManager } from 'react-native-audio-api';
import logger from '../utils/logger';

export type AudioSessionMode = 'playback' | 'record';

class AudioSessionManager {
  /** The category currently applied to the AVAudioSession (null = never set). */
  private mode: AudioSessionMode | null = null;

  /** The mode last applied (testing/diagnostics). */
  getMode(): AudioSessionMode | null {
    return this.mode;
  }

  /**
   * Ensure a playback-capable session is active before any audio is scheduled.
   * (Re)asserts the playback session on EVERY call — iOS can deactivate the
   * session between operations, and the audio engines relied on per-call
   * re-activation, so this is intentionally NOT idempotent on activation. The one
   * exception: an active recording session is left untouched (`playAndRecord`
   * already permits playback, so we must not downgrade mid-record).
   */
  async ensurePlayback(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (this.mode === 'record') return;
    await this.apply('playback');
  }

  /** Ensure a record+playback session is active before recording starts.
   *  (Re)asserts every call, matching the recorder's prior per-start activation. */
  async ensureRecording(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    await this.apply('record');
  }

  /**
   * Restore a playback-only session after recording ends. Recording raises the
   * category to `playAndRecord`; without restoring it, later playback would run
   * against a record session. No-op if we weren't recording.
   */
  async restorePlaybackAfterRecording(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (this.mode !== 'record') return;
    await this.apply('playback');
  }

  private async apply(mode: AudioSessionMode): Promise<void> {
    // Part of the [TTS-SM] trace: a silent/wrong AVAudioSession is a top cause of
    // "audio plays but nothing comes out" on iOS, so every (re)assert is logged.
    logger.log(`[TTS-SM] iOS session apply → ${mode} (was ${this.mode ?? 'none'})`);
    try {
      if (mode === 'playback') {
        AudioManager.setAudioSessionOptions({ iosCategory: 'playback', iosMode: 'default' });
      } else {
        AudioManager.setAudioSessionOptions({
          iosCategory: 'playAndRecord',
          iosMode: 'default',
          iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
        });
      }
      await AudioManager.setAudioSessionActivity(true);
      this.mode = mode;
    } catch (e) {
      // Non-fatal: a failed activation shouldn't crash playback/recording. The
      // caller proceeds; worst case is the pre-existing silent-on-iOS behaviour.
      logger.warn('[AudioSession] failed to set', mode, e instanceof Error ? e.message : String(e));
    }
  }

  /** Test helper. */
  _reset(): void {
    this.mode = null;
  }
}

export const audioSessionManager = new AudioSessionManager();
