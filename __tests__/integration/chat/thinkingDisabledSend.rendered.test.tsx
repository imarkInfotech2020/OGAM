import {
  CHAT_THINKING_DISABLED_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_THINKING_DISABLED_SCENARIOS)(
  'Mobile chat send with Thinking disabled on $label',
  scenario => {
    it('disables Thinking in quick settings and shows the clean reply to the next message', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;

      await h.send('Give me a short greeting.', {
        text: 'Hello without thinking.',
        thinkingText: 'Reasoning that must stay hidden.',
      });
      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .getByText('Give me a short greeting.'),
        ).toBeVisible();
        expect(view.getByText('Hello without thinking.')).toBeVisible();
        expect(view.getByTestId('chat-input')).toBeEnabled();
      });

      expect(view.queryByText('Reasoning that must stay hidden.')).toBeNull();
      expect(view.queryByText('Generation Error')).toBeNull();
    });
  },
);
