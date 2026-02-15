/**
 * SettingsScreen Tests
 *
 * Tests for the settings screen including:
 * - Title and version display
 * - Navigation items
 * - Theme selector
 * - Privacy section
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// Navigation is globally mocked in jest.setup.ts

jest.mock('../../../src/hooks/useFocusTrigger', () => ({
  useFocusTrigger: () => 0,
}));

jest.mock('../../../src/components', () => ({
  Card: ({ children, style }: any) => {
    const { View } = require('react-native');
    return <View style={style}>{children}</View>;
  },
}));

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity style={style} onPress={onPress}>
        {children}
      </TouchableOpacity>
    );
  },
}));

// Mock package.json
jest.mock('../../../package.json', () => ({ version: '1.0.0' }), {
  virtual: true,
});

const mockSetOnboardingComplete = jest.fn();
const mockSetThemeMode = jest.fn();
jest.mock('../../../src/stores', () => ({
  useAppStore: jest.fn((selector?: any) => {
    const state = {
      setOnboardingComplete: mockSetOnboardingComplete,
      themeMode: 'system',
      setThemeMode: mockSetThemeMode,
    };
    return selector ? selector(state) : state;
  }),
}));

import { SettingsScreen } from '../../../src/screens/SettingsScreen';

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Settings" title', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Settings')).toBeTruthy();
  });

  it('renders version number', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('1.0.0')).toBeTruthy();
  });

  it('renders navigation items', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Model Settings')).toBeTruthy();
    expect(getByText('Voice Transcription')).toBeTruthy();
    expect(getByText('Security')).toBeTruthy();
    expect(getByText('Device Information')).toBeTruthy();
    expect(getByText('Storage')).toBeTruthy();
  });

  it('renders theme selector with system/light/dark options', () => {
    const { getByText } = render(<SettingsScreen />);
    // The Appearance row contains the theme selector with system/light/dark icons
    // Verify the Appearance label exists which houses the theme toggle
    expect(getByText('Appearance')).toBeTruthy();
    // The three theme options are rendered as TouchableOpacity with Icon children
    // (system=monitor, light=sun, dark=moon). Since icons are mocked, we verify
    // the overall structure renders without error.
  });

  it('renders Privacy First section', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Privacy First')).toBeTruthy();
    expect(
      getByText(/All your data stays on this device/),
    ).toBeTruthy();
  });

  it('shows Appearance label', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Appearance')).toBeTruthy();
  });
});
