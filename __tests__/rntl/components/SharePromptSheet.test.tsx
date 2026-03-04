/**
 * SharePromptSheet Component Tests
 *
 * Tests for the share/star prompt bottom sheet:
 * - Renders message and buttons when visible
 * - "Star on GitHub" opens correct URL
 * - "Share on X" opens correct URL
 * - "Maybe later" dismisses the sheet
 *
 * Priority: P1 (High)
 */

import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SharePromptSheet } from '../../../src/components/SharePromptSheet';
import { GITHUB_URL, SHARE_ON_X_URL } from '../../../src/utils/sharePrompt';

jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

describe('SharePromptSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the message text when visible', () => {
    const { getByText } = render(
      <SharePromptSheet visible={true} onClose={jest.fn()} />,
    );
    expect(getByText(/Off Grid is completely free/)).toBeTruthy();
  });

  it('renders Star on GitHub button', () => {
    const { getByText } = render(
      <SharePromptSheet visible={true} onClose={jest.fn()} />,
    );
    expect(getByText('Star on GitHub')).toBeTruthy();
  });

  it('renders Share on X button', () => {
    const { getByText } = render(
      <SharePromptSheet visible={true} onClose={jest.fn()} />,
    );
    expect(getByText('Share on X')).toBeTruthy();
  });

  it('renders Maybe later dismiss link', () => {
    const { getByText } = render(
      <SharePromptSheet visible={true} onClose={jest.fn()} />,
    );
    expect(getByText('Maybe later')).toBeTruthy();
  });

  it('opens GitHub URL and calls onClose when Star on GitHub is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <SharePromptSheet visible={true} onClose={onClose} />,
    );
    fireEvent.press(getByText('Star on GitHub'));
    expect(Linking.openURL).toHaveBeenCalledWith(GITHUB_URL);
    expect(onClose).toHaveBeenCalled();
  });

  it('opens Twitter intent URL and calls onClose when Share on X is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <SharePromptSheet visible={true} onClose={onClose} />,
    );
    fireEvent.press(getByText('Share on X'));
    expect(Linking.openURL).toHaveBeenCalledWith(SHARE_ON_X_URL);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Maybe later is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <SharePromptSheet visible={true} onClose={onClose} />,
    );
    fireEvent.press(getByText('Maybe later'));
    expect(onClose).toHaveBeenCalled();
  });
});
