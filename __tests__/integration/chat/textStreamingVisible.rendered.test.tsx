import { setupChatScreen } from '../../harness/chatHarness';

describe('Mobile text streaming visibility', () => {
  it('shows the assistant bubble while text is still streaming on iOS', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'ios' });
    const view = h.render();
    const partial = 'The first part is visible';
    const complete = `${partial}, and then the reply finishes.`;

    h.boundary.llama!.scriptCompletion({
      text: complete,
      pauseAfter: partial,
    });
    await h.tapSend('Stream a reply');

    await h.rtl.waitFor(() => {
      expect(view.getByText(partial)).toBeVisible();
      expect(view.getByTestId('stop-button')).toBeVisible();
      expect(view.queryByText(complete)).toBeNull();
    });

    h.boundary.llama!.releaseStream();
    await h.rtl.waitFor(() => {
      expect(view.getByText(complete)).toBeVisible();
      expect(view.getByTestId('chat-input')).toBeEnabled();
      expect(view.queryByTestId('stop-button')).toBeNull();
      expect(view.queryByText('Generation Error')).toBeNull();
    });
  });
});
