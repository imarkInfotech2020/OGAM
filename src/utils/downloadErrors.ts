import type { BackgroundDownloadReasonCode, BackgroundDownloadStatus } from '../types';

function getReasonMessageFromCode(reasonCode?: BackgroundDownloadReasonCode | string | null): string | null {
  if (reasonCode === 'HTTP 401' || reasonCode === 'HTTP 403') {
    return 'The download server rejected access to this file.';
  }
  if (reasonCode === 'HTTP 404') {
    return 'The file could not be found on the download server.';
  }
  if (reasonCode === 'HTTP 416') {
    return 'The server could not resume this download. Please retry it.';
  }
  switch (reasonCode) {
    case 'network_lost':
      return 'Network connection lost - waiting to resume...';
    case 'network_timeout':
      return 'The download took too long to respond. Please try again.';
    case 'server_unavailable':
      return 'The download server is temporarily unavailable. Please try again later.';
    case 'download_interrupted':
      return 'The connection dropped while downloading. Please try again.';
    case 'disk_full':
      return 'Not enough storage space for this download.';
    case 'file_corrupted':
      return 'The downloaded file failed verification.';
    case 'empty_response':
      return 'The download server returned an empty response.';
    case 'user_cancelled':
      return 'Download cancelled.';
    case 'http_401':
    case 'http_403':
      return 'The download server rejected access to this file.';
    case 'http_404':
      return 'The file could not be found on the download server.';
    case 'http_416':
      return 'The server could not resume this download. Please retry it.';
    case 'client_error':
      return 'The download request was rejected by the server.';
    case 'unknown_error':
      return 'Something went wrong while downloading.';
    default:
      return null;
  }
}

function getLegacyMessage(reason?: string | null): string {
  const raw = (reason || '').trim();
  if (!raw) return 'Something went wrong while downloading.';

  const displayRaw = raw.length > 120 ? 'Something went wrong while downloading.' : raw;
  const normalized = raw.toLowerCase();

  const matchers: Array<{ message: string; test: (value: string) => boolean }> = [
    { message: 'Download cancelled.', test: value => value.includes('download cancelled') },
    {
      message: 'Network connection lost - waiting to resume...',
      test: value => value.includes('waiting for network') || value.includes('network connection lost'),
    },
    {
      message: 'The download took too long to respond. Please try again.',
      test: value => value.includes('timed out') || value.includes('timeout'),
    },
    {
      message: 'The connection dropped while downloading. Please try again.',
      test: value => (
        value.includes('connection abort') ||
        value.includes('connection reset') ||
        value.includes('broken pipe') ||
        value.includes('failed to connect') ||
        value.includes('unable to resolve host') ||
        value.includes('network') ||
        value.includes('socket')
      ),
    },
    {
      message: 'The download server rejected access to this file.',
      test: value => value.includes('http 401') || value.includes('http 403'),
    },
    { message: 'The file could not be found on the download server.', test: value => value.includes('http 404') },
    { message: 'The server could not resume this download. Please retry it.', test: value => value.includes('http 416') },
    { message: 'The download server is temporarily unavailable. Please try again later.', test: value => value.includes('http 5') },
    {
      message: 'Not enough storage space for this download.',
      test: value => value.includes('not enough disk space') || value.includes('insufficient space'),
    },
    {
      message: 'The downloaded file failed verification.',
      test: value => value.includes('file corrupted') || value.includes('sha256 mismatch'),
    },
    { message: 'The connection dropped while downloading. Please try again.', test: value => value.includes('interrupted') },
  ];

  for (const matcher of matchers) {
    if (matcher.test(normalized)) {
      return matcher.message;
    }
  }

  return displayRaw;
}

export function isRetryableError(
  reason?: string | null,
  reasonCode?: BackgroundDownloadReasonCode | string | null,
): boolean {
  if (reasonCode) {
    return (
      reasonCode === 'network_lost' ||
      reasonCode === 'network_timeout' ||
      reasonCode === 'server_unavailable' ||
      reasonCode === 'download_interrupted' ||
      reasonCode === 'unknown_error'
    );
  }

  const normalized = (reason || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes('http 401') || normalized.includes('http 403') || normalized.includes('http 404')) return false;
  if (normalized.includes('not enough disk space') || normalized.includes('insufficient space')) return false;
  if (normalized.includes('file corrupted') || normalized.includes('sha256 mismatch')) return false;
  if (normalized.includes('download cancelled')) return false;
  return true;
}

export function getUserFacingDownloadMessage(
  reason?: string | null,
  reasonCode?: BackgroundDownloadReasonCode | string | null,
): string {
  return getReasonMessageFromCode(reasonCode) ?? getLegacyMessage(reason);
}

export function getDownloadStatusLabel(
  status: BackgroundDownloadStatus | string,
  reasonCode?: BackgroundDownloadReasonCode | string | null,
  reason?: string | null,
): string {
  if (status === 'waiting_for_network') return 'Waiting for network';
  if (status === 'pending' && reason) {
    const pendingMessage = getUserFacingDownloadMessage(reason, reasonCode);
    if (pendingMessage === 'Network connection lost - waiting to resume...') {
      return pendingMessage;
    }
  }
  if (status === 'retrying') {
    if (reasonCode === 'server_unavailable') return 'Server unavailable. Retrying...';
    if (reasonCode === 'network_timeout') return 'Connection timed out. Retrying...';
    if (reason) {
      const retryMessage = getUserFacingDownloadMessage(reason, reasonCode);
      if (retryMessage === 'Network connection lost - waiting to resume...') {
        return retryMessage;
      }
    }
    return 'Reconnecting...';
  }
  if (status === 'failed') return getUserFacingDownloadMessage(reason, reasonCode);
  if (status === 'pending') return 'Queued';
  if (status === 'paused') return 'Paused';
  if (status === 'running' || status === 'downloading') return 'Downloading...';
  if (status === 'cancelled') return 'Cancelled';
  return typeof status === 'string' ? status : 'Unknown';
}
