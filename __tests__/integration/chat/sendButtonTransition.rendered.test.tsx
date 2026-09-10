import {
  CHAT_PLATFORM_ENGINE_CASES,
  setupChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_PLATFORM_ENGINE_CASES)(
  'Mobile chat send control transition on $label',
  ({ platform, engine }) => {
    it('shows the existing loading indicator immediately, then shows Stop while the reply is running', async () => {
      const h = await setupChatScreen({ engine, platform });
      const view = h.render();

      h.scriptTextTurn({
        text: 'This reply must stay in progress.',
        holdBeforeStream: true,
      });

      const input = await h.rtl.waitFor(() => view.getByTestId('chat-input'));
      h.rtl.act(() => {
        input.props.onChangeText('Send this now');
      });

      const sendButton = await h.rtl.waitFor(() =>
        view.getByTestId('send-button'),
      );
      let pressable: typeof sendButton | null = sendButton;
      while (pressable && typeof pressable.props.onPress !== 'function') {
        pressable = pressable.parent;
      }
      if (!pressable) throw new Error('The send control is not pressable.');
      const pressSend = pressable.props.onPress as () => void;
      h.rtl.act(() => {
        pressSend();
      });

      expect(view.getByTestId('send-loading-dots')).toBeVisible();
      expect(view.queryByTestId('send-button')).toBeNull();

      await h.rtl.waitFor(() => {
        expect(view.getByTestId('stop-button')).toBeVisible();
        expect(view.queryByTestId('send-loading-dots')).toBeNull();
      });

      h.rtl.fireEvent.press(view.getByTestId('stop-button'));
      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .getByText('Send this now'),
        ).toBeVisible();
        expect(view.getByTestId('chat-input')).toBeEnabled();
        expect(view.queryByTestId('stop-button')).toBeNull();
        expect(view.queryByText('Generation Error')).toBeNull();
      });
    });
  },
);
