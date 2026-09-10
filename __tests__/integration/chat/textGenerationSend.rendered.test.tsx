import { setupChatScreen } from '../../harness/chatHarness';

describe('Mobile text generation send journey', () => {
  it('sends one message and shows the completed reply', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'ios' });
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
});
