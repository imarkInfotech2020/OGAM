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

  const matchers: Array<{ message: string; keywords: string[] }> = [
    { message: 'Download cancelled.', keywords: ['download cancelled'] },
    {
      message: 'Network connection lost - waiting to resume...',
      keywords: ['waiting for network', 'network connection lost'],
    },
    {
      message: 'The download took too long to respond. Please try again.',
      keywords: ['timed out', 'timeout'],
    },
    {
      message: 'The connection dropped while downloading. Please try again.',
      keywords: [
        'connection abort',
        'connection reset',
        'broken pipe',
        'failed to connect',
        'unable to resolve host',
        'network',
        'socket',
        'interrupted'
      ],
    },
    {
      message: 'The download server rejected access to this file.',
      keywords: ['http 401', 'http 403'],
    },
    { message: 'The file could not be found on the download server.', keywords: ['http 404'] },
    { message: 'The server could not resume this download. Please retry it.', keywords: ['http 416'] },
    { message: 'The download server is temporarily unavailable. Please try again later.', keywords: ['http 5'] },
    {
      message: 'The downloaded file failed verification.',
      keywords: ['file corrupted', 'sha256 mismatch'],
    },
  ];

  for (const matcher of matchers) {
    if (matcher.keywords.some(kw => normalized.includes(kw))) {
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

const NETWORK_LOST_LABEL = 'Network connection lost - waiting to resume...';

const SIMPLE_STATUS_LABELS: Partial<Record<string, string>> = {
  waiting_for_network: 'Waiting for network',
  paused: 'Paused',
  running: 'Downloading...',
  downloading: 'Downloading...',
  cancelled: 'Cancelled',
};

function getPendingLabel(
  reasonCode?: BackgroundDownloadReasonCode | string | null,
  reason?: string | null,
): string {
  const effectiveReason = reason ?? (typeof reasonCode === 'string' ? reasonCode : null);
  if (effectiveReason && getUserFacingDownloadMessage(effectiveReason) === NETWORK_LOST_LABEL) {
    return NETWORK_LOST_LABEL;
  }
  return 'Queued';
}

function getRetryingLabel(
  reasonCode?: BackgroundDownloadReasonCode | string | null,
  reason?: string | null,
): string {
  if (reasonCode === 'server_unavailable') return 'Server unavailable. Retrying...';
  if (reasonCode === 'network_timeout') return 'Connection timed out. Retrying...';
  if (reason && getUserFacingDownloadMessage(reason, reasonCode) === NETWORK_LOST_LABEL) {
    return NETWORK_LOST_LABEL;
  }
  return 'Reconnecting...';
}

export function getDownloadStatusLabel(
  status: BackgroundDownloadStatus | string,
  reasonCode?: BackgroundDownloadReasonCode | string | null,
  reason?: string | null,
): string {
  const simple = SIMPLE_STATUS_LABELS[status as string];
  if (simple) return simple;
  if (status === 'pending') return getPendingLabel(reasonCode, reason);
  if (status === 'retrying') return getRetryingLabel(reasonCode, reason);
  if (status === 'failed') return getUserFacingDownloadMessage(reason, reasonCode);
  return typeof status === 'string' ? status : 'Unknown';
}
