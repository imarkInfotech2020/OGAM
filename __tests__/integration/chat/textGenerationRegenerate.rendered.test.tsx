import {
  CHAT_TEXT_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_TEXT_SCENARIOS)(
  'Mobile text generation regenerate journey on $label',
  scenario => {
    it('regenerates an assistant response and shows its replacement', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;

      await h.send('Give me a short greeting.', {
        text: 'Hello from the first reply.',
      });
      await h.rtl.waitFor(() => {
        expect(view.getByText('Hello from the first reply.')).toBeVisible();
      });

      await h.regenerateLast(
        { text: 'Hello from the regenerated reply.' },
        'dots',
      );

      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .getByText('Give me a short greeting.'),
        ).toBeVisible();
        expect(
          view.getByText('Hello from the regenerated reply.'),
        ).toBeVisible();
        expect(view.queryByText('Hello from the first reply.')).toBeNull();
        expect(view.getByTestId('chat-input')).toBeEnabled();
        expect(view.queryByTestId('action-menu')).toBeNull();
      });
      expect(view.queryByText('Generation Error')).toBeNull();
    });
  },
);
