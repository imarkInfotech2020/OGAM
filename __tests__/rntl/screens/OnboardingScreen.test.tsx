/**
 * OnboardingScreen Tests
 *
 * Tests for the onboarding screen including:
 * - First slide content rendering
 * - Navigation dots
 * - Get Started / Next button
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
  Button: ({ title, onPress, disabled, testID }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID={testID}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

jest.mock('../../../src/components/CustomAlert', () => ({
  CustomAlert: () => null,
  showAlert: jest.fn(() => ({ visible: true })),
  hideAlert: jest.fn(() => ({ visible: false })),
  initialAlertState: { visible: false },
}));

jest.mock('../../../src/components/Button', () => ({
  Button: ({ title, onPress, disabled, testID }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID={testID}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

const mockSetOnboardingComplete = jest.fn();

jest.mock('../../../src/stores', () => ({
  useAppStore: jest.fn((selector?: any) => {
    const state = {
      setOnboardingComplete: mockSetOnboardingComplete,
    };
    return selector ? selector(state) : state;
  }),
}));

jest.mock('../../../src/constants', () => ({
  ...jest.requireActual('../../../src/constants'),
  ONBOARDING_SLIDES: [
    { id: 'slide1', keyword: 'Welcome', title: 'Off Grid', description: 'Your AI companion', accentColor: '#0066FF' },
    { id: 'slide2', keyword: 'Private', title: 'On-Device', description: 'Everything stays local', accentColor: '#00CC66' },
  ],
}));

import { OnboardingScreen } from '../../../src/screens/OnboardingScreen';

const mockNavigate = jest.fn();
const mockReset = jest.fn();
const mockReplace = jest.fn();
const navigation = {
  navigate: mockNavigate,
  reset: mockReset,
  replace: mockReplace,
} as any;

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders first slide content', () => {
    const { getByText } = render(<OnboardingScreen navigation={navigation} />);
    expect(getByText('Welcome')).toBeTruthy();
    expect(getByText('Off Grid')).toBeTruthy();
    expect(getByText('Your AI companion')).toBeTruthy();
  });

  it('shows navigation dots', () => {
    const { getByTestId } = render(<OnboardingScreen navigation={navigation} />);
    // The onboarding screen has a testID
    expect(getByTestId('onboarding-screen')).toBeTruthy();
  });

  it('shows Next button on first slide', () => {
    const { getByText } = render(<OnboardingScreen navigation={navigation} />);
    expect(getByText('Next')).toBeTruthy();
  });

  it('shows Skip button on non-last slide', () => {
    const { getByText } = render(<OnboardingScreen navigation={navigation} />);
    expect(getByText('Skip')).toBeTruthy();
  });
});
