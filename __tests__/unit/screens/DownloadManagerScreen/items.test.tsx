import { formatBytes, getStatusText } from '../../../../src/screens/DownloadManagerScreen/items';

describe('DownloadManagerScreen/items helpers', () => {
  it('formats bytes for human-readable display', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('maps active download statuses to display text', () => {
    expect(getStatusText('running')).toBe('Downloading...');
    expect(getStatusText('retrying')).toBe('Retrying connection...');
    expect(getStatusText('waiting_for_network')).toBe('Waiting for network');
    expect(getStatusText('failed')).toBe('Needs attention');
  });
});
