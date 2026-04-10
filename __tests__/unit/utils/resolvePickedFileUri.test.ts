import { Platform } from 'react-native';
import { keepLocalCopy } from '@react-native-documents/picker';
import { resolvePickedFileUri } from '../../../src/utils/resolvePickedFileUri';

jest.mock('@react-native-documents/picker', () => ({
  keepLocalCopy: jest.fn(),
}));

const mockKeepLocalCopy = keepLocalCopy as jest.MockedFunction<typeof keepLocalCopy>;

describe('resolvePickedFileUri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Android', () => {
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    });

    it('returns decoded local path when keepLocalCopy succeeds', async () => {
      mockKeepLocalCopy.mockResolvedValue([
        { status: 'success', localUri: 'file:///data/user/0/com.app/Documents/my%20file.pdf' },
      ] as any);

      const result = await resolvePickedFileUri('content://provider/doc/1', 'my file.pdf');

      expect(result).toBe('/data/user/0/com.app/Documents/my file.pdf');
      expect(mockKeepLocalCopy).toHaveBeenCalledWith({
        files: [{ uri: 'content://provider/doc/1', fileName: 'my file.pdf' }],
        destination: 'documentDirectory',
      });
    });

    it('throws when keepLocalCopy returns non-success status', async () => {
      mockKeepLocalCopy.mockResolvedValue([{ status: 'error' }] as any);

      await expect(resolvePickedFileUri('content://provider/doc/1', 'file.pdf'))
        .rejects.toThrow('Failed to create a local copy of the document');
    });

    it('throws when keepLocalCopy returns success but localUri is null', async () => {
      mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: null }] as any);

      await expect(resolvePickedFileUri('content://provider/doc/1', 'file.pdf'))
        .rejects.toThrow('Failed to create a local copy of the document');
    });

    it('propagates error when keepLocalCopy throws', async () => {
      mockKeepLocalCopy.mockRejectedValue(new Error('Storage full'));

      await expect(resolvePickedFileUri('content://provider/doc/1', 'file.pdf'))
        .rejects.toThrow('Storage full');
    });

    it('does not fall back to original content:// URI on failure', async () => {
      mockKeepLocalCopy.mockResolvedValue([{ status: 'error' }] as any);

      await expect(resolvePickedFileUri('content://provider/doc/1', 'file.pdf'))
        .rejects.toThrow();
    });
  });

  describe('iOS', () => {
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    });

    it('decodes file:// URI and strips prefix', async () => {
      const result = await resolvePickedFileUri(
        'file:///var/mobile/Documents/my%20file.pdf',
        'my file.pdf',
      );
      expect(result).toBe('/var/mobile/Documents/my file.pdf');
    });

    it('handles URI with no encoding', async () => {
      const result = await resolvePickedFileUri(
        'file:///var/mobile/Documents/report.pdf',
        'report.pdf',
      );
      expect(result).toBe('/var/mobile/Documents/report.pdf');
    });

    it('returns URI as-is when decoding fails', async () => {
      const original = global.decodeURIComponent;
      global.decodeURIComponent = () => { throw new Error('bad uri'); };

      const result = await resolvePickedFileUri('file:///bad%uri', 'file.pdf');
      expect(result).toBe('file:///bad%uri');

      global.decodeURIComponent = original;
    });

    it('does not call keepLocalCopy on iOS', async () => {
      await resolvePickedFileUri('file:///var/mobile/Documents/file.pdf', 'file.pdf');
      expect(mockKeepLocalCopy).not.toHaveBeenCalled();
    });
  });
});
