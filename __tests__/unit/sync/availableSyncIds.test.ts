/**
 * Telling "we have this file" apart from "we know about this file".
 *
 * A shared-file record outlives its bytes all the time: the user deleted the download, a transfer never
 * finished, the OS cleared a cache directory. If the UI trusts the record instead of the disk, every one of
 * those rows offers Open and Share on a file that is not there - the user taps and nothing happens, or the app
 * hands another device a path that resolves to nothing.
 *
 * The filesystem is the only thing stood in for, at the react-native-fs boundary the repo already fakes.
 */
import RNFS from 'react-native-fs';
import { availableSyncIds } from '../../../pro/sync/availableSyncIds';

const record = (syncId: string, localPath: string): { syncId: string; localPath: string } => ({
  syncId,
  localPath
});

const existsFake = RNFS.exists as unknown as jest.Mock;

beforeEach(() => {
  existsFake.mockReset();
});

describe('which shared files are actually on disk', () => {
  it('reports only the ones whose bytes are still there', async () => {
    existsFake.mockImplementation(async (p: string) => p === '/files/kept.pdf');

    const present = await availableSyncIds([
      record('kept', '/files/kept.pdf'),
      record('deleted', '/files/deleted.pdf')
    ]);

    // The deleted one stays a record but stops being available - that difference is what keeps Open and Share
    // off a row that cannot honour them.
    expect(present.has('kept')).toBe(true);
    expect(present.has('deleted')).toBe(false);
    expect(present.size).toBe(1);
  });

  it('treats a filesystem that cannot answer as "not available"', async () => {
    // A real device says this: a path on an unmounted volume, a permission the app lost, a name the OS refuses.
    existsFake.mockImplementation(async (p: string) => {
      if (p === '/files/unreadable.pdf') throw new Error('EACCES: permission denied');
      return true;
    });

    const present = await availableSyncIds([
      record('fine', '/files/fine.pdf'),
      record('unreadable', '/files/unreadable.pdf')
    ]);

    // Absent, not a crash: one unreadable path must not take down the whole list, or a single bad file makes
    // every other shared file disappear from the screen.
    expect(present.has('fine')).toBe(true);
    expect(present.has('unreadable')).toBe(false);
  });

  it('has nothing to report for an empty list', async () => {
    const present = await availableSyncIds([]);

    expect(present.size).toBe(0);
    expect(existsFake).not.toHaveBeenCalled();
  });
});
