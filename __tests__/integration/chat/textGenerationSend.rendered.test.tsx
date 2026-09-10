import {
  CHAT_PLATFORM_ENGINE_CASES,
  setupChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_PLATFORM_ENGINE_CASES)(
  'Mobile text generation send journey on $label',
  ({ platform, engine }) => {
    it('sends one message and shows the completed reply', async () => {
      const h = await setupChatScreen({ engine, platform });
      const view = h.render();

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
