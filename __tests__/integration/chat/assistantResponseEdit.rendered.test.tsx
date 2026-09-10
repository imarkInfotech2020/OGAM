import { setupChatScreen } from '../../harness/chatHarness';

describe.each(['ios', 'android'] as const)(
  'Mobile assistant response edit journey on %s',
  platform => {
    it('edits a response in place without resending the user message', async () => {
      const h = await setupChatScreen({ engine: 'llama', platform });
      const view = h.render();

      await h.send('Give me a short greeting.', {
        text: 'Hello from the original response.',
      });
      await h.rtl.waitFor(() => {
        expect(
          view.getByText('Hello from the original response.'),
        ).toBeVisible();
      });

      await h.openActionMenu('user', 'dots');
      expect(view.queryByText('Select text')).toBeNull();
      expect(view.queryByTestId('action-select-text')).toBeNull();
      h.rtl.fireEvent.press(view.getByTestId('action-edit'));
      await h.rtl.waitFor(() => {
        expect(view.getByText('SAVE & RESEND')).toBeVisible();
      });
      h.rtl.fireEvent.press(view.getByText('CANCEL'));

      await h.openActionMenu('assistant', 'dots');
      expect(view.queryByText('Select text')).toBeNull();
      expect(view.queryByTestId('action-select-text')).toBeNull();
      h.rtl.fireEvent.press(view.getByTestId('action-edit'));
      const editInput = await h.rtl.waitFor(() =>
        view.getByPlaceholderText('Enter message...'),
      );
      expect(view.getByText('SAVE')).toBeVisible();
      expect(view.queryByText('SAVE & RESEND')).toBeNull();

      h.rtl.fireEvent.changeText(editInput, 'Hello from the edited response.');
      h.rtl.fireEvent.press(view.getByText('SAVE'));

      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .getByText('Give me a short greeting.'),
        ).toBeVisible();
        expect(view.getByText('Hello from the edited response.')).toBeVisible();
        expect(
          view.queryByText('Hello from the original response.'),
        ).toBeNull();
        expect(view.queryByPlaceholderText('Enter message...')).toBeNull();
        expect(view.getByTestId('chat-input')).toBeEnabled();
      });
      expect(view.queryByText('Generation Error')).toBeNull();
      expect(view.queryByText('Edit Error')).toBeNull();
    });
  },
);
