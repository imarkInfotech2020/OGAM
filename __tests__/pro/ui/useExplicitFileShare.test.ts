/**
 * Sharing a file the user picked, on purpose.
 *
 * Every path out of this hook is something the user sees, and two of them are silence. Cancelling the system
 * picker must say nothing at all - a red "Could not share this file" after someone deliberately backed out is the
 * app blaming them for a decision they made. But a real failure must NOT be silent, or a file the user believes
 * is on its way never arrives and nothing ever says so.
 *
 * The other thing worth pinning is the re-entrancy guard. The share button stays on screen while the picker is
 * open, so a second tap must not start a second pick - two pickers racing to write the same transfer is a corrupt
 * one.
 *
 * Faked: the document picker and the file-uri resolver (native), and the sync service (the boundary this hook
 * hands work to). The projection that decides WHO the file goes to is real.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

const mockPicker = { pick: jest.fn() };
jest.mock('@react-native-documents/picker', () => ({
  pick: (...args: unknown[]) => mockPicker.pick(...args),
  isErrorWithCode: (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value,
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));

const mockResolvePickedFileUri = jest.fn();
jest.mock('@offgrid/core/utils/resolvePickedFileUri', () => ({
  resolvePickedFileUri: (...args: unknown[]) => mockResolvePickedFileUri(...args),
}));

const mockShareExplicitFile = jest.fn();
jest.mock('@offgrid/pro/sync/sharedFileSyncService', () => ({
  sharedFileSyncService: {
    shareExplicitFile: (...args: unknown[]) => mockShareExplicitFile(...args),
  },
}));

type HookModule = typeof import('@offgrid/pro/ui/SyncScreen/useExplicitFileShare');
let useExplicitFileShare: HookModule['useExplicitFileShare'];
let available = true;

beforeAll(() => {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    useExplicitFileShare = (
      require('@offgrid/pro/ui/SyncScreen/useExplicitFileShare') as HookModule
    ).useExplicitFileShare;
    /* eslint-enable @typescript-eslint/no-var-requires */
  } catch {
    available = false; // private pro/ submodule absent
  }
});

const CONNECTED_MAC = {
  id: 'the-mac',
  name: 'The Mac',
  status: 'connected',
} as never;
const CONNECTED_IPAD = {
  id: 'the-ipad',
  name: 'The iPad',
  status: 'connected',
} as never;

const PICKED = { name: 'Contract.pdf', uri: 'content://picked/1', type: 'application/pdf' };

// The real sentinel for "every paired device", imported rather than spelled - a literal here would silently
// select no destinations and every assertion below would fail for the wrong reason.
/* eslint-disable @typescript-eslint/no-var-requires */
const { AMBIENT_SHARE_ANY_DESTINATION } = require('@offgrid/sync');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('sharing a picked file', () => {
  const maybe = (name: string, body: jest.ProvidesCallback): void => {
    // eslint-disable-next-line jest/valid-title, jest/no-disabled-tests
    (available ? it : it.skip)(name, body);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPicker.pick.mockResolvedValue([PICKED]);
    mockResolvePickedFileUri.mockResolvedValue('/tmp/resolved/Contract.pdf');
    mockShareExplicitFile.mockResolvedValue(undefined);
    Platform.OS = 'ios';
  });

  const hook = (devices: readonly never[], destinationId = AMBIENT_SHARE_ANY_DESTINATION) =>
    renderHook(() => useExplicitFileShare({ destinationId, devices }));

  maybe('hands the resolved file to the sync service, for the devices the projection chose', async () => {
    const { result } = hook([CONNECTED_MAC]);

    await act(async () => {
      await result.current.share();
    });

    // The RESOLVED path, not the content:// uri the picker returned - a content uri is not readable by the
    // transfer, so passing it through would fail later and further from the cause.
    expect(mockResolvePickedFileUri).toHaveBeenCalledWith('content://picked/1', 'Contract.pdf');
    expect(mockShareExplicitFile).toHaveBeenCalledWith({
      path: '/tmp/resolved/Contract.pdf',
      name: 'Contract.pdf',
      mimeType: 'application/pdf',
      destinationIds: ['the-mac'],
    });
  });

  maybe('says the work is queued rather than claiming it is done', async () => {
    const { result } = hook([CONNECTED_MAC]);

    await act(async () => {
      await result.current.share();
    });

    // "Added to Activity" is the truth: the transfer runs in the background and can still fail. Saying "Sent"
    // here would make the Activity row look like a contradiction.
    expect(result.current.message).toBe('Added to Activity for background sharing.');
    expect(result.current.error).toBeNull();
  });

  maybe('counts the devices when it is going to more than one', async () => {
    const { result } = hook([CONNECTED_MAC, CONNECTED_IPAD]);

    await act(async () => {
      await result.current.share();
    });

    expect(mockShareExplicitFile.mock.calls[0][0].destinationIds).toEqual(['the-mac', 'the-ipad']);
    expect(result.current.message).toBe('Added to Activity for 2 devices.');
  });

  maybe('asks for nothing when there is nobody to send to', async () => {
    const { result } = hook([]);

    await act(async () => {
      await result.current.share();
    });

    // The picker never opens. Letting a user choose a file first and only then telling them they have no paired
    // device wastes the interaction and reads as a failure.
    expect(mockPicker.pick).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Pair a device before sharing a file.');
  });

  maybe('opens the picker in the mode each platform needs', async () => {
    Platform.OS = 'android';
    const android = hook([CONNECTED_MAC]);
    await act(async () => {
      await android.result.current.share();
    });
    // 'open' on Android: 'import' copies into app storage, which is the wrong thing for a file the user is
    // pointing at rather than handing over.
    expect(mockPicker.pick).toHaveBeenCalledWith({ mode: 'open', allowMultiSelection: false });

    mockPicker.pick.mockClear();
    Platform.OS = 'ios';
    const ios = hook([CONNECTED_MAC]);
    await act(async () => {
      await ios.result.current.share();
    });
    expect(mockPicker.pick).toHaveBeenCalledWith({ mode: 'import', allowMultiSelection: false });
  });

  maybe('says NOTHING when the user cancels the picker', async () => {
    mockPicker.pick.mockRejectedValue({ code: 'OPERATION_CANCELED' });
    const { result } = hook([CONNECTED_MAC]);

    await act(async () => {
      await result.current.share();
    });

    // Backing out is a decision, not a fault. An error here blames the user for what they chose.
    expect(result.current.error).toBeNull();
    expect(result.current.message).toBeNull();
    expect(mockShareExplicitFile).not.toHaveBeenCalled();
  });

  maybe('says nothing when the picker returns without a file', async () => {
    mockPicker.pick.mockResolvedValue([]);
    const { result } = hook([CONNECTED_MAC]);

    await act(async () => {
      await result.current.share();
    });

    // Some pickers resolve empty instead of rejecting on cancel. Same user intent, so the same silence - and
    // nothing may be handed to the transfer.
    expect(result.current.error).toBeNull();
    expect(mockShareExplicitFile).not.toHaveBeenCalled();
  });

  maybe('reports a real failure with the reason it was given', async () => {
    mockShareExplicitFile.mockRejectedValue(new Error('No space left on the device'));
    const { result } = hook([CONNECTED_MAC]);

    await act(async () => {
      await result.current.share();
    });

    // The opposite of the cancel case, and the reason the two must be told apart: a file the user believes is
    // on its way and never arrives, with nothing said, is the worst outcome here.
    expect(result.current.error).toBe('No space left on the device');
  });

  maybe('falls back to a readable message when the failure is not an Error', async () => {
    mockResolvePickedFileUri.mockRejectedValue('a string from a native module');
    const { result } = hook([CONNECTED_MAC]);

    await act(async () => {
      await result.current.share();
    });

    expect(result.current.error).toBe('Could not share this file.');
  });

  maybe('names a file the picker could not name', async () => {
    mockPicker.pick.mockResolvedValue([{ ...PICKED, name: '   ' }]);
    const { result } = hook([CONNECTED_MAC]);

    await act(async () => {
      await result.current.share();
    });

    // A blank name would arrive on the other device as a file with no name, or fail the transfer's own
    // validation. 'shared-file' is at least openable.
    expect(mockShareExplicitFile.mock.calls[0][0].name).toBe('shared-file');
  });

  maybe('refuses a second tap while the first pick is still open', async () => {
    let releasePicker: (files: unknown[]) => void = () => {};
    mockPicker.pick.mockImplementation(
      () =>
        new Promise(resolve => {
          releasePicker = resolve as (files: unknown[]) => void;
        }),
    );
    const { result } = hook([CONNECTED_MAC]);

    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.share();
    });
    await waitFor(() => expect(result.current.sharing).toBe(true));
    await act(async () => {
      await result.current.share(); // the second tap
    });

    // One picker at a time. Two racing to write the same transfer is a corrupt transfer, and the button stays on
    // screen while the sheet is open, so this is a tap a user will make.
    expect(mockPicker.pick).toHaveBeenCalledTimes(1);
    await act(async () => {
      releasePicker([PICKED]);
      await first;
    });
  });

  maybe('stops reporting itself as busy however the attempt ends', async () => {
    const { result } = hook([CONNECTED_MAC]);
    await act(async () => {
      await result.current.share();
    });
    expect(result.current.sharing).toBe(false);

    mockShareExplicitFile.mockRejectedValue(new Error('nope'));
    await act(async () => {
      await result.current.share();
    });

    // Without the finally clause a failed share would leave the button disabled until the screen is rebuilt.
    expect(result.current.sharing).toBe(false);
  });

  maybe('clears a previous error when a new attempt starts', async () => {
    mockShareExplicitFile.mockRejectedValueOnce(new Error('first attempt failed'));
    const { result } = hook([CONNECTED_MAC]);
    await act(async () => {
      await result.current.share();
    });
    expect(result.current.error).toBe('first attempt failed');

    await act(async () => {
      await result.current.share();
    });

    // A stale red message beside a successful share is the user's evidence contradicting itself.
    expect(result.current.error).toBeNull();
    expect(result.current.message).toBe('Added to Activity for background sharing.');
  });

  maybe('includes an offline device, so the file reaches it on reconnect', async () => {
    const { result } = hook([
      CONNECTED_MAC,
      { id: 'offline-phone', name: 'Old Phone', status: 'offline' } as never,
    ]);

    await act(async () => {
      await result.current.share();
    });

    // Deliberately NOT connected-only. An explicit share is a decision about a device, not about whether it
    // happens to be awake - the transfer waits and delivers on reconnect, which is what the projection's
    // "receives the file after reconnecting" wording promises the user.
    expect(mockShareExplicitFile.mock.calls[0][0].destinationIds).toEqual([
      'the-mac',
      'offline-phone',
    ]);
  });
});
