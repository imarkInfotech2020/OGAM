const ERROR_MESSAGES: Record<string, string> = {
  network_lost:         'Connection lost. Check your network and try again.',
  network_timeout:      'Connection timed out. Try again on a stable network.',
  server_unavailable:   'Server is unavailable. Try again later.',
  download_interrupted: 'Download was interrupted. Please retry.',
  disk_full:            'Not enough storage. Free up space and retry.',
  file_corrupted:       'Downloaded file was corrupted. Please retry.',
  empty_response:       'Server returned an empty response. Try again later.',
  user_cancelled:       'Download was cancelled.',
  http_401:             'Access denied. Authentication required.',
  http_403:             'Access denied. You may not have permission to download this file.',
  http_404:             'File not found. It may have been moved or removed.',
  http_416:             'Download resume failed. Will restart from the beginning.',
  http_429:             'Server is rate-limiting. Retrying with backoff.',
  client_error:         'A client error occurred. Please retry.',
  unknown_error:        'Download failed. Try again on a stable connection.',
};

export function toUserMessage(reason?: string, code?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (reason) return reason;
  return ERROR_MESSAGES.unknown_error;
}

export function getUserFacingDownloadMessage(message?: string, code?: string): string {
  return toUserMessage(message, code);
}

export function getDownloadStatusLabel(status: string, reasonCode?: string, reason?: string): string {
  if (status === 'retrying') return 'Retrying connection...';
  if (status === 'waiting_for_network') return 'Waiting for network';
  if (status === 'pending') return 'Queued';
  if (status === 'failed') return toUserMessage(reason, reasonCode);
  if (status === 'running' || status === 'downloading') return 'Downloading...';
  return toUserMessage(reason, reasonCode);
}

export function isRetryableError(code?: string): boolean {
  return code === 'network_lost' ||
    code === 'network_timeout' ||
    code === 'server_unavailable' ||
    code === 'download_interrupted' ||
    code === 'http_429';
}
