import { getDownloadStatusLabel, getUserFacingDownloadMessage, isRetryableError } from '../../../src/utils/downloadErrors';

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

  describe('isRetryableError', () => {
    it('returns true for network errors', () => {
      expect(isRetryableError('Software caused connection abort')).toBe(true);
      expect(isRetryableError('connection reset')).toBe(true);
      expect(isRetryableError('failed to connect')).toBe(true);
    });

    it('returns true for timeouts', () => {
      expect(isRetryableError('timeout')).toBe(true);
      expect(isRetryableError('timed out')).toBe(true);
    });

    it('returns true for 5xx errors', () => {
      expect(isRetryableError('HTTP 500')).toBe(true);
      expect(isRetryableError('HTTP 502')).toBe(true);
      expect(isRetryableError('HTTP 503')).toBe(true);
    });

    it('returns true for interrupted/unknown errors', () => {
      expect(isRetryableError('Download interrupted')).toBe(true);
      expect(isRetryableError('Unknown error')).toBe(true);
    });

    it('returns false for HTTP client errors (401, 403, 404)', () => {
      expect(isRetryableError('HTTP 401')).toBe(false);
      expect(isRetryableError('HTTP 403')).toBe(false);
      expect(isRetryableError('HTTP 404')).toBe(false);
    });

    it('returns false for disk space errors', () => {
      expect(isRetryableError('not enough disk space')).toBe(false);
      expect(isRetryableError('insufficient space')).toBe(false);
    });

    it('returns false for file corruption', () => {
      expect(isRetryableError('file corrupted')).toBe(false);
      expect(isRetryableError('sha256 mismatch')).toBe(false);
    });

    it('returns false for cancelled downloads', () => {
      expect(isRetryableError('download cancelled')).toBe(false);
    });

    it('returns true for empty/null reasons', () => {
      expect(isRetryableError(null)).toBe(true);
      expect(isRetryableError('')).toBe(true);
      expect(isRetryableError(undefined)).toBe(true);
    });
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
