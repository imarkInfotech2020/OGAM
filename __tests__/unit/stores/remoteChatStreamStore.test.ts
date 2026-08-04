import type { ChatStreamPreview } from '@offgrid/sync';
import { useRemoteChatStreamStore } from '../../../src/stores/remoteChatStreamStore';

/**
 * The replies currently generating on the user's other devices.
 *
 * Asking the Mac something and watching the answer arrive on the phone is the whole shared-brain promise, and
 * this is where the phone holds what it has been shown so far. It is a projection and nothing more: the pro
 * chat-stream service owns frames, ordering and expiry, and the finished message arrives separately through
 * the op-log - so nothing here is durable, and a free build never writes to it at all.
 */
describe('replies generating on another device', () => {
  const preview = (
    overrides: Partial<ChatStreamPreview> = {},
  ): ChatStreamPreview =>
    ({
      conversationId: 'chat-7',
      deviceId: 'the-mac',
      text: 'thinking about it',
      ...overrides,
    } as ChatStreamPreview);

  beforeEach(() => {
    useRemoteChatStreamStore.setState({ previews: [] });
  });

  it('holds nothing until another device says it is generating', () => {
    // Empty is the free-build state and the offline state, and the chat screen has to behave exactly as it
    // did before when it is.
    expect(useRemoteChatStreamStore.getState().previews).toEqual([]);
  });

  it('shows what the other device has generated so far', () => {
    useRemoteChatStreamStore.getState().setPreviews([preview()]);

    expect(useRemoteChatStreamStore.getState().previews).toEqual([preview()]);
  });

  it('replaces the whole set, because it is a projection and not a log', () => {
    useRemoteChatStreamStore
      .getState()
      .setPreviews([preview({ text: 'thinking' })]);

    useRemoteChatStreamStore
      .getState()
      .setPreviews([preview({ text: 'thinking about it more' })]);

    // Appending would leave the earlier half of a reply on screen underneath the newer one.
    expect(useRemoteChatStreamStore.getState().previews).toEqual([
      preview({ text: 'thinking about it more' }),
    ]);
  });

  it('lets a finished reply disappear', () => {
    useRemoteChatStreamStore.getState().setPreviews([preview()]);

    useRemoteChatStreamStore.getState().setPreviews([]);

    // The real message arrives through the op-log, so the preview has to go or the chat shows it twice.
    expect(useRemoteChatStreamStore.getState().previews).toEqual([]);
  });

  it('keeps one preview per conversation apart from another', () => {
    useRemoteChatStreamStore.getState().setPreviews([
      preview({ conversationId: 'chat-7', text: 'on the Mac' }),
      preview({
        conversationId: 'chat-9',
        deviceId: 'the-ipad',
        text: 'on the iPad',
      }),
    ]);

    // Two devices can be generating at once, and each conversation shows only its own.
    expect(
      useRemoteChatStreamStore
        .getState()
        .previews.map(({ conversationId }) => conversationId),
    ).toEqual(['chat-7', 'chat-9']);
  });

  it('tells a subscriber the moment something changes', () => {
    const seen: number[] = [];
    const unsubscribe = useRemoteChatStreamStore.subscribe(state =>
      seen.push(state.previews.length),
    );

    useRemoteChatStreamStore.getState().setPreviews([preview()]);
    useRemoteChatStreamStore.getState().setPreviews([]);

    // The chat screen renders off this subscription: a write that did not notify would show the reply only
    // after some other, unrelated render.
    expect(seen).toEqual([1, 0]);
    unsubscribe();
  });
});
