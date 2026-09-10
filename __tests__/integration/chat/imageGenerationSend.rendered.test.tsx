import { Modal } from 'react-native';

import {
  CHAT_LOCAL_PLATFORM_ENGINE_CASES,
  setupChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_LOCAL_PLATFORM_ENGINE_CASES)(
  'Mobile image generation send journey on $label',
  ({ platform, engine }) => {
    it('keeps the enhanced prompt before the image in one response bubble', async () => {
      const h = await setupChatScreen({ engine, platform });
      const view = h.render();

      await h.placeImageModel({
        backend: platform === 'ios' ? 'coreml' : 'mnn',
      });
      await h.cycleImageMode();
      await h.rtl.waitFor(() => {
        expect(view.getByTestId('image-mode-force-badge')).toBeVisible();
      });
      await h.cycleImageMode();
      await h.cycleImageMode();
      await h.rtl.waitFor(() => {
        expect(
          h.rtl.within(view.getByTestId('quick-image-mode')).getByText('Auto'),
        ).toBeVisible();
      });

      const quickSettingsModal = view
        .UNSAFE_getAllByType(Modal)
        .find(modal => h.rtl.within(modal).queryByTestId('quick-image-mode'));
      if (!quickSettingsModal) {
        throw new Error('The open quick-settings menu could not be closed.');
      }
      h.rtl.fireEvent(quickSettingsModal, 'requestClose');
      await h.rtl.waitFor(() => {
        expect(view.queryByTestId('quick-image-mode')).toBeNull();
      });

      h.rtl.fireEvent.press(view.getByTestId('chat-settings-icon'));
      h.rtl.fireEvent.press(
        await h.rtl.waitFor(() => view.getByTestId('modal-image-accordion')),
      );
      h.rtl.fireEvent.press(
        await h.rtl.waitFor(() => view.getByTestId('image-enhance-on')),
      );
      const settingsModal = view
        .UNSAFE_getAllByType(Modal)
        .find(modal => h.rtl.within(modal).queryByText('Chat Settings'));
      if (!settingsModal) {
        throw new Error('The chat settings sheet could not be closed.');
      }
      h.rtl.fireEvent(settingsModal, 'requestClose');
      await h.rtl.waitFor(() => {
        expect(view.queryByText('Chat Settings')).toBeNull();
      });

      const enhancedPrompt =
        'A green Lamborghini driving on a mountain road, detailed bodywork, natural light.';
      h.scriptTextTurn({ text: enhancedPrompt });
      await h.tapSend('Draw a green lamborghini');
      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .getByText('Draw a green lamborghini'),
        ).toBeVisible();
        return view.getByTestId('generated-image-content');
      });

      h.rtl.fireEvent(view.getByTestId('generated-image-content'), 'load');
      await h.rtl.waitFor(() => {
        expect(view.getByLabelText('Generated image loaded')).toBeTruthy();
        expect(view.getByTestId('chat-input')).toBeEnabled();
      });

      const imageResponse = view
        .getAllByTestId('assistant-message')
        .find(message =>
          h.rtl.within(message).queryByTestId('generated-image-content'),
        );
      if (!imageResponse) {
        throw new Error(
          'The generated image response bubble was not rendered.',
        );
      }
      expect(
        h.rtl.within(imageResponse).getByText('Enhanced prompt'),
      ).toBeVisible();
      expect(
        h.rtl.within(imageResponse).getByText(/green Lamborghini driving/i),
      ).toBeVisible();
      expect(
        h.rtl
          .within(imageResponse)
          .getByText(/Generated image for:.*Draw a green lamborghini/),
      ).toBeVisible();
      expect(view.getAllByText('Enhanced prompt')).toHaveLength(1);

      const bubble = h.rtl.within(imageResponse).getByTestId('message-bubble');
      const renderedNodes = bubble.findAll(() => true);
      const promptIndex = renderedNodes.indexOf(
        h.rtl.within(bubble).getByText('Enhanced prompt'),
      );
      const imageIndex = renderedNodes.indexOf(
        h.rtl.within(bubble).getByTestId('generated-image-content'),
      );
      const captionIndex = renderedNodes.indexOf(
        h.rtl
          .within(bubble)
          .getByText(/Generated image for:.*Draw a green lamborghini/),
      );
      expect(promptIndex).toBeGreaterThanOrEqual(0);
      expect(captionIndex).toBeGreaterThan(promptIndex);
      expect(imageIndex).toBeGreaterThan(captionIndex);
      expect(view.queryByText('Generation Error')).toBeNull();
    });
  },
);
