import { viewDocument } from '@react-native-documents/viewer';
import type { SharedFileLibraryItem } from '../../../pro/sync/sharedFileLibrary';
import { openSharedFile } from '../../../pro/ui/SyncScreen/openSharedFile';

const view = viewDocument as jest.MockedFunction<typeof viewDocument>;

/**
 * Tapping a file that arrived from another device.
 *
 * Where the tap goes depends on what the file IS. An image that landed in the gallery should open in the
 * gallery beside the rest of the user's pictures, a file attached to a conversation should open that
 * conversation, and anything else has no home in this app so the OS viewer handles it.
 *
 * The case that actually bites is the middle one with the conversation missing - a file recorded as a chat
 * attachment whose conversation was since deleted. Navigating to a chat that is not there is a blank screen
 * with no way back to the file, so it has to fall through to the viewer instead.
 */
describe('opening a file that arrived from another device', () => {
  const file = (
    overrides: Partial<SharedFileLibraryItem> = {},
  ): SharedFileLibraryItem =>
    ({
      syncId: 'shared-1',
      kind: 'file',
      name: 'holiday.png',
      mimeType: 'image/png',
      fileSize: 2048,
      createdAt: '2026-08-01T10:00:00.000Z',
      localPath: '/docs/shared_files/holiday.png',
      available: true,
      ...overrides,
    } as SharedFileLibraryItem);

  const navigation = () => {
    const routes: Array<{ name: string; params?: Record<string, unknown> }> =
      [];
    return {
      routes,
      navigate: (name: string, params?: Record<string, unknown>) =>
        routes.push({ name, params }),
    };
  };

  beforeEach(() => {
    view.mockClear();
    view.mockResolvedValue(null as never);
  });

  it('opens a picture in the gallery, beside the rest of them', () => {
    const nav = navigation();

    openSharedFile('gallery', file({ conversationId: 'chat-7' }), nav);

    expect(nav.routes).toEqual([
      { name: 'Gallery', params: { conversationId: 'chat-7' } },
    ]);
    // Handled in-app: handing an image to the OS viewer would drop the user out of Off Grid entirely.
    expect(view).not.toHaveBeenCalled();
  });

  it('opens the gallery even for a picture that belongs to no conversation', () => {
    const nav = navigation();

    openSharedFile('gallery', file(), nav);

    // A picture shared on its own still has a place in the gallery; the gallery just opens unfiltered.
    expect(nav.routes).toEqual([
      { name: 'Gallery', params: { conversationId: undefined } },
    ]);
  });

  it('opens the conversation a file was attached to', () => {
    const nav = navigation();

    openSharedFile('chat', file({ conversationId: 'chat-7' }), nav);

    expect(nav.routes).toEqual([
      { name: 'Chat', params: { conversationId: 'chat-7' } },
    ]);
    expect(view).not.toHaveBeenCalled();
  });

  it('falls back to the OS viewer when the conversation is no longer there', () => {
    const nav = navigation();

    openSharedFile('chat', file({ conversationId: undefined }), nav);

    // Navigating anyway would land the user on a blank chat with the file nowhere in reach.
    expect(nav.routes).toEqual([]);
    expect(view).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a plain file', 'native_file' as const],
    ['a file with no recorded destination', undefined],
  ])('hands %s to the OS viewer', (_label, destination) => {
    const nav = navigation();

    openSharedFile(destination, file({ name: 'contract.pdf' }), nav);

    expect(nav.routes).toEqual([]);
    expect(view).toHaveBeenCalledWith({
      uri: 'file:///docs/shared_files/holiday.png',
      mimeType: 'image/png',
      // The viewer's own title bar, so the user sees the name the sender used rather than our staged path.
      headerTitle: 'contract.pdf',
      grantPermissions: 'read',
    });
  });

  it('does not double up the scheme on a path that already has one', () => {
    openSharedFile(
      'native_file',
      file({ localPath: 'file:///docs/shared_files/holiday.png' }),
      navigation(),
    );

    expect(view).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///docs/shared_files/holiday.png' }),
    );
  });

  it('stays quiet when the OS has nothing that can open the file', async () => {
    view.mockRejectedValueOnce(new Error('UNABLE_TO_OPEN'));

    // A tap on a file no installed app understands is a no-op, not an unhandled rejection - which on
    // Android is a red box over whatever the user was looking at.
    expect(() =>
      openSharedFile('native_file', file({ name: 'model.gguf' }), navigation()),
    ).not.toThrow();
    await Promise.resolve();
  });
});
