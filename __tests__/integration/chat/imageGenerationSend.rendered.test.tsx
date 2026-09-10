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
        expect(h.assertions.isGeneratedImageLoaded()).toBe(true);
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
        expect(h.assertions.isPromptEnhancementVisible()).toBe(true);
        expect(
          h.assertions.isPromptEnhancementPartOfGeneratedImage(
            /green Lamborghini driving/i,
            /Generated image for:.*Draw a green lamborghini/,
          ),
        ).toBe(true);
      } else {
        expect(h.assertions.isPromptEnhancementVisible()).toBe(false);
        expect(view.queryByText(/green Lamborghini driving/i)).toBeNull();
      }
      expect(
        view.queryByText('Reasoning must never become an image prompt.'),
      ).toBeNull();
      expect(
        h.assertions.isGeneratedImageCaptionVisible(
          /Generated image for:.*Draw a green lamborghini/,
        ),
      ).toBe(true);
      expect(view.queryByText('Generation Error')).toBeNull();
    });
  },
);
