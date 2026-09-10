import type { RenderAPI } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

type TestingLibrary = typeof import('@testing-library/react-native');
type TextMatcher = string | RegExp;

export interface ChatAssertions {
  isResponseVisible(text: TextMatcher): boolean;
  isGeneratedImageVisible(): boolean;
  isGeneratedImageLoaded(): boolean;
  isGeneratedImageCaptionVisible(prompt: TextMatcher): boolean;
  isPromptEnhancementPartOfGeneratedImage(
    enhancedPrompt: TextMatcher,
    caption: TextMatcher,
  ): boolean;
  isThinkingVisible(): boolean;
  isPromptEnhancementVisible(): boolean;
  isAttachedPhotoVisible(): boolean;
  isAttachedDocumentVisible(): boolean;
  isToolCallVisible(toolName: string): boolean;
  isToolResultVisible(detail: TextMatcher): boolean;
  isAttachedPhotoClickable(): Promise<boolean>;
  isAttachedDocumentClickable(): Promise<boolean>;
  isToolCallClickable(
    toolName: string,
    visibleDetail: TextMatcher,
  ): Promise<boolean>;
}

async function pressAndObserve(
  rtl: TestingLibrary,
  target: ReactTestInstance,
  visibleOutcome: () => ReactTestInstance | null,
): Promise<boolean> {
  rtl.fireEvent.press(target);
  try {
    await rtl.waitFor(() => {
      expect(visibleOutcome()).not.toBeNull();
    });
    return true;
  } catch {
    return false;
  }
}

function isVisible(target: ReactTestInstance | null): boolean {
  if (!target) return false;
  try {
    expect(target).toBeVisible();
    return true;
  } catch {
    return false;
  }
}

/**
 * Queries and gestures for user-visible Chat outcomes. These methods never read stores,
 * component callbacks, call counts, or other implementation details.
 */
export function createChatAssertions(
  view: RenderAPI,
  rtl: TestingLibrary,
): ChatAssertions {
  return {
    isResponseVisible(text) {
      return isVisible(view.queryByText(text));
    },

    isGeneratedImageVisible() {
      return isVisible(view.queryByTestId('generated-image-content'));
    },

    isGeneratedImageLoaded() {
      return view.queryByLabelText('Generated image loaded') !== null;
    },

    isGeneratedImageCaptionVisible(prompt) {
      return isVisible(view.queryByText(prompt));
    },

    isPromptEnhancementPartOfGeneratedImage(enhancedPrompt, caption) {
      const response = view
        .queryAllByTestId('assistant-message')
        .find(message =>
          rtl.within(message).queryByTestId('generated-image-content'),
        );
      if (!response) return false;
      const bubble = rtl.within(response).queryByTestId('message-bubble');
      if (!bubble) return false;
      const prompt = rtl.within(bubble).queryByText(enhancedPrompt);
      const captionNode = rtl.within(bubble).queryByText(caption);
      const generatedImage = rtl
        .within(bubble)
        .queryByTestId('generated-image-content');
      if (!prompt || !captionNode || !generatedImage) return false;
      const renderedNodes = bubble.findAll(() => true);
      return (
        renderedNodes.indexOf(prompt) < renderedNodes.indexOf(captionNode) &&
        renderedNodes.indexOf(captionNode) < renderedNodes.indexOf(generatedImage)
      );
    },

    isThinkingVisible() {
      return Boolean(
        view.queryByTestId('thinking-block') ??
          view.queryByTestId('thinking-indicator'),
      );
    },

    isPromptEnhancementVisible() {
      return view.queryByText('Enhanced prompt') !== null;
    },

    isAttachedPhotoVisible() {
      return view.queryByTestId(/^attachment-image-/) !== null;
    },

    isAttachedDocumentVisible() {
      return view.queryByTestId(/^document-preview-/) !== null;
    },

    isToolCallVisible(toolName) {
      return (
        view.queryByTestId(`tool-result-label-${toolName}`) !== null ||
        view.queryByTestId(`tool-result-accordion-${toolName}`) !== null
      );
    },

    isToolResultVisible(detail) {
      return isVisible(view.queryByText(detail));
    },

    async isAttachedPhotoClickable() {
      const photo = view.queryByTestId(/^attachment-image-/);
      if (!photo || view.queryByText('Close')) return false;
      const opened = await pressAndObserve(
        rtl,
        photo,
        () => view.queryByText('Close'),
      );
      if (opened) rtl.fireEvent.press(view.getByText('Close'));
      return opened;
    },

    async isAttachedDocumentClickable() {
      const document = view.queryByTestId(/^document-preview-/);
      if (!document || view.queryByText('Close')) return false;
      const opened = await pressAndObserve(
        rtl,
        document,
        () => view.queryByText('Close'),
      );
      if (opened) rtl.fireEvent.press(view.getByText('Close'));
      return opened;
    },

    async isToolCallClickable(toolName, visibleDetail) {
      const tool =
        view.queryByTestId(`tool-result-label-${toolName}`) ??
        view.queryByTestId(`tool-result-accordion-${toolName}`);
      if (!tool || view.queryByText(visibleDetail)) return false;
      const expanded = await pressAndObserve(
        rtl,
        tool,
        () => view.queryByText(visibleDetail),
      );
      if (expanded) rtl.fireEvent.press(tool);
      return expanded;
    },
  };
}
