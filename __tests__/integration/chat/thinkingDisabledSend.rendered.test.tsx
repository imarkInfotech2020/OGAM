import { Modal } from 'react-native';

import { setupChatScreen } from '../../harness/chatHarness';

describe.each(['ios', 'android'] as const)(
  'Mobile chat send with Thinking disabled on %s',
  platform => {
    it('disables Thinking in quick settings and shows the clean reply to the next message', async () => {
      const h = await setupChatScreen({ engine: 'llama', platform });
      const view = h.render();

      h.rtl.fireEvent.press(
        await h.rtl.waitFor(() => view.getByTestId('quick-settings-button')),
      );
      const thinkingToggle = await h.rtl.waitFor(() =>
        view.getByTestId('quick-thinking-toggle'),
      );
      expect(h.rtl.within(thinkingToggle).getByText('OFF')).toBeVisible();

      h.rtl.fireEvent.press(thinkingToggle);
      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getByTestId('quick-thinking-toggle'))
            .getByText('ON'),
        ).toBeVisible();
      });

      h.rtl.fireEvent.press(view.getByTestId('quick-thinking-toggle'));
      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getByTestId('quick-thinking-toggle'))
            .getByText('OFF'),
        ).toBeVisible();
      });

      const quickSettingsModal = view
        .UNSAFE_getAllByType(Modal)
        .find(modal =>
          h.rtl.within(modal).queryByTestId('quick-thinking-toggle'),
        );
      if (!quickSettingsModal) {
        throw new Error('The open quick-settings menu could not be closed.');
      }
      h.rtl.fireEvent(quickSettingsModal, 'requestClose');
      await h.rtl.waitFor(() => {
        expect(view.queryByTestId('quick-thinking-toggle')).toBeNull();
      });

      await h.send('Give me a short greeting.', {
        text: 'Hello without thinking.',
        thinkingText: 'Reasoning that must stay hidden.',
      });
      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .getByText('Give me a short greeting.'),
        ).toBeVisible();
        expect(view.getByText('Hello without thinking.')).toBeVisible();
        expect(view.getByTestId('chat-input')).toBeEnabled();
      });

      expect(view.queryByText('Reasoning that must stay hidden.')).toBeNull();
      expect(view.queryByText('Generation Error')).toBeNull();
    });
  },
);
