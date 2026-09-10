import {
  CHAT_PLATFORM_ENGINE_CASES,
  setupChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_PLATFORM_ENGINE_CASES)(
  'Mobile first-message conversation title journey on $label',
  ({ platform, engine }) => {
    it('uses the first sent message as the visible conversation title', async () => {
      const h = await setupChatScreen({ engine, platform });
      const view = h.render();
      const firstMessage = 'Plan a mountain trip';

      expect(view.getByText('New Chat')).toBeVisible();

      await h.send(firstMessage, { text: 'Where would you like to go?' });
      await h.rtl.waitFor(() => {
        const visibleCopies = view.getAllByText(firstMessage);
        expect(visibleCopies).toHaveLength(2);
        visibleCopies.forEach(copy => expect(copy).toBeVisible());
        expect(view.queryByText('New Conversation')).toBeNull();
      });
    });
  },
);
