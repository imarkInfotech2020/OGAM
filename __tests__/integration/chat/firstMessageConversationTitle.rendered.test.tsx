import {
  CHAT_TEXT_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_TEXT_SCENARIOS)(
  'Mobile first-message conversation title journey on $label',
  scenario => {
    it('uses the first sent message as the visible conversation title', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;
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
