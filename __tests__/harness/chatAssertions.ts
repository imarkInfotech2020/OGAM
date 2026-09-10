import type { RenderAPI } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

type TestingLibrary = typeof import('@testing-library/react-native');
type TextMatcher = string | RegExp;

export interface ChatAssertions {
  isThinkingVisible(): boolean;
  isPromptEnhancementVisible(): boolean;
  isAttachedPhotoVisible(): boolean;
  isAttachedDocumentVisible(): boolean;
  isToolCallVisible(toolName: string): boolean;
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

/**
 * Queries and gestures for user-visible Chat outcomes. These methods never read stores,
 * component callbacks, call counts, or other implementation details.
 */
export function createChatAssertions(
  view: RenderAPI,
  rtl: TestingLibrary,
): ChatAssertions {
  return {
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
