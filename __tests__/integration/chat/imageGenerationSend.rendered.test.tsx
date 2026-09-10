import {
  CHAT_IMAGE_GENERATION_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_IMAGE_GENERATION_SCENARIOS)(
  'Mobile image generation send journey on $label',
  scenario => {
    it('shows the generated image and only shows a prompt rewrite when the scenario requires one', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;
      const enhancedPrompt =
        'A green Lamborghini driving on a mountain road, detailed bodywork, natural light.';
      h.scriptImageTurnFor(scenario, {
        enhancedPrompt,
        thinkingText: 'Reasoning must never become an image prompt.',
      });
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
      if (scenario.expectsEnhancedImagePrompt()) {
        expect(
          h.rtl.within(imageResponse).getByText('Enhanced prompt'),
        ).toBeVisible();
        expect(
          h.rtl.within(imageResponse).getByText(/green Lamborghini driving/i),
        ).toBeVisible();

        const bubble = h.rtl
          .within(imageResponse)
          .getByTestId('message-bubble');
        const renderedNodes = bubble.findAll(() => true);
        const promptIndex = renderedNodes.indexOf(
          h.rtl.within(bubble).getByText('Enhanced prompt'),
        );
        const captionIndex = renderedNodes.indexOf(
          h.rtl
            .within(bubble)
            .getByText(/Generated image for:.*Draw a green lamborghini/),
        );
        const imageIndex = renderedNodes.indexOf(
          h.rtl.within(bubble).getByTestId('generated-image-content'),
        );
        expect(promptIndex).toBeGreaterThanOrEqual(0);
        expect(captionIndex).toBeGreaterThan(promptIndex);
        expect(imageIndex).toBeGreaterThan(captionIndex);
      } else {
        expect(
          h.rtl.within(imageResponse).queryByText('Enhanced prompt'),
        ).toBeNull();
        expect(view.queryByText(/green Lamborghini driving/i)).toBeNull();
      }
      expect(
        view.queryByText('Reasoning must never become an image prompt.'),
      ).toBeNull();
      expect(
        h.rtl
          .within(imageResponse)
          .getByText(/Generated image for:.*Draw a green lamborghini/),
      ).toBeVisible();
      expect(view.queryByText('Generation Error')).toBeNull();
    });
  },
);
