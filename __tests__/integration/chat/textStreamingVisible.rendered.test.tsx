import {
  CHAT_TEXT_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_TEXT_SCENARIOS)(
  'Mobile text streaming visibility on $label',
  scenario => {
    it('shows the assistant bubble while text is still streaming', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;
      const partial = 'The first part is visible';
      const complete = `${partial}, and then the reply finishes.`;

      h.scriptTextTurn({
        text: complete,
        pauseAfter: partial,
      });
      await h.tapSend('Stream a reply');

      await h.rtl.waitFor(() => {
        expect(view.getByText(partial)).toBeVisible();
        expect(view.getByTestId('stop-button')).toBeVisible();
        expect(view.queryByText(complete)).toBeNull();
      });

      h.releaseTextStream();
      await h.rtl.waitFor(() => {
        expect(view.getByText(complete)).toBeVisible();
        expect(view.getByTestId('chat-input')).toBeEnabled();
        expect(view.queryByTestId('stop-button')).toBeNull();
        expect(view.queryByText('Generation Error')).toBeNull();
      });
    });
  },
);
