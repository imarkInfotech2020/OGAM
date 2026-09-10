import { setupChatScreen } from '../../harness/chatHarness';

describe('Mobile text generation resend journey', () => {
  it('resends the original message and shows its replacement reply', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'ios' });
    const view = h.render();

    await h.send('Give me a short greeting.', {
      text: 'Hello from the first reply.',
    });
    await h.rtl.waitFor(() => {
      expect(view.getByText('Hello from the first reply.')).toBeVisible();
    });

    h.boundary.llama!.scriptCompletion({
      text: 'Hello from the resent reply.',
    });
    await h.openActionMenu('user', 'dots');
    h.rtl.fireEvent.press(view.getByTestId('action-retry'));

    await h.rtl.waitFor(() => {
      expect(view.getByText('Give me a short greeting.')).toBeVisible();
      expect(view.getByText('Hello from the resent reply.')).toBeVisible();
      expect(view.queryByText('Hello from the first reply.')).toBeNull();
      expect(view.getByTestId('chat-input')).toBeEnabled();
      expect(view.queryByTestId('action-menu')).toBeNull();
    });
    expect(view.queryByText('Generation Error')).toBeNull();
  });
});
