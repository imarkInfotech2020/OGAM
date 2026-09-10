import {
  CHAT_TEXT_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_TEXT_SCENARIOS)(
  'Mobile text generation send journey on $label',
  scenario => {
    it('sends one message and shows the completed reply', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;

      await h.send('Give me a short greeting.', {
        text: 'Hello from the first reply.',
      });
      await h.rtl.waitFor(() => {
        expect(view.getByText('Hello from the first reply.')).toBeVisible();
        expect(view.getByTestId('chat-input')).toBeEnabled();
      });

      expect(view.queryByText('Generation Error')).toBeNull();
    });
  },
);
