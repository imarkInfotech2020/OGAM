import { getDownloadStatusLabel, getUserFacingDownloadMessage } from '../../../src/utils/downloadErrors';

describe('downloadErrors', () => {
  it('maps network failures to friendlier copy', () => {
    expect(getUserFacingDownloadMessage('Software caused connection abort')).toBe(
      'The connection dropped while downloading. Please try again.',
    );
  });

  it('maps timeout failures to friendlier copy', () => {
    expect(getUserFacingDownloadMessage('timeout')).toBe(
      'The download took too long to respond. Please try again.',
    );
  });

  it('maps failed status labels through the helper', () => {
    expect(getDownloadStatusLabel('failed', 'HTTP 416')).toBe(
      'The server could not resume this download. Please retry it.',
    );
  });

  it('maps pending network labels through the helper', () => {
    expect(getDownloadStatusLabel('pending', 'Network connection lost. Waiting to resume.')).toBe(
      'Network connection lost - waiting to resume...',
    );
  });

  describe('getUserFacingDownloadMessage', () => {
    it('maps 5xx server errors', () => {
      expect(getUserFacingDownloadMessage('HTTP 500')).toBe(
        'The download server is temporarily unavailable. Please try again later.',
      );
      expect(getUserFacingDownloadMessage('HTTP 502')).toBe(
        'The download server is temporarily unavailable. Please try again later.',
      );
    });

    it('truncates excessively long error strings', () => {
      const longError = 'a'.repeat(200);
      expect(getUserFacingDownloadMessage(longError)).toBe(
        'Something went wrong while downloading.',
      );
    });

    it('preserves legitimate disk space errors', () => {
      const diskError = 'Not enough disk space (need 2GB, have 1GB)';
      expect(getUserFacingDownloadMessage(diskError)).toBe(diskError);
    });
  });
});
