import {
  CHAT_TEXT_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_TEXT_SCENARIOS)(
  'Mobile text generation resend journey on $label',
  scenario => {
    it('resends the original message and shows its replacement reply', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;

      await h.send('Give me a short greeting.', {
        text: 'Hello from the first reply.',
      });
      await h.rtl.waitFor(() => {
        expect(view.getByText('Hello from the first reply.')).toBeVisible();
      });

      h.scriptTextTurn({
        text: 'Hello from the resent reply.',
      });
      await h.openActionMenu('user', 'dots');
      h.rtl.fireEvent.press(view.getByTestId('action-retry'));

      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .getByText('Give me a short greeting.'),
        ).toBeVisible();
        expect(view.getByText('Hello from the resent reply.')).toBeVisible();
        expect(view.queryByText('Hello from the first reply.')).toBeNull();
        expect(view.getByTestId('chat-input')).toBeEnabled();
        expect(view.queryByTestId('action-menu')).toBeNull();
      });
      expect(view.queryByText('Generation Error')).toBeNull();
    });

    it('removes the failed attempt when resend succeeds', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;

      await h.send('Try this again.', {
        throwMessage: 'The first attempt failed.',
      });
      await h.rtl.waitFor(() => {
        expect(view.getByText('The first attempt failed.')).toBeVisible();
      });
      h.rtl.fireEvent.press(view.getByText('OK'));

      h.scriptTextTurn({ text: 'The retry worked.' });
      await h.openActionMenu('user', 'dots');
      h.rtl.fireEvent.press(view.getByTestId('action-retry'));

      await h.rtl.waitFor(() => {
        expect(view.getByText('The retry worked.')).toBeVisible();
        expect(view.queryByText('The first attempt failed.')).toBeNull();
      });
    });
  },
);
