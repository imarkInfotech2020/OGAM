/**
 * PassphraseSetupScreen Tests
 *
 * Tests for the passphrase setup/change screen including:
 * - Title display for new setup vs change mode
 * - Input fields rendering
 * - Cancel button behavior
 * - Form validation (too short, too long, mismatch)
 * - Successful submit for new passphrase
 * - Successful submit for change passphrase
 * - Error states (wrong current passphrase, service failure)
 * - Button disabled while submitting
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../../../src/components', () => ({
  Card: ({ children, style }: any) => {
    const { View } = require('react-native');
    return <View style={style}>{children}</View>;
  },
  Button: ({ title, onPress, disabled }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID={`button-${title}`}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('../../../src/components/Button', () => ({
  Button: ({ title, onPress, disabled }: any) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID={`button-${title}`}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

const mockShowAlert = jest.fn((_t: string, _m: string, _b?: any) => ({
  visible: true,
  title: _t,
  message: _m,
  buttons: _b || [],
}));

jest.mock('../../../src/components/CustomAlert', () => ({
  CustomAlert: ({ visible, title, message }: any) => {
    if (!visible) return null;
    const { View, Text } = require('react-native');
    return (
      <View testID="custom-alert">
        <Text testID="alert-title">{title}</Text>
        <Text testID="alert-message">{message}</Text>
      </View>
    );
  },
  showAlert: (...args: any[]) => mockShowAlert(...args),
  hideAlert: jest.fn(() => ({ visible: false, title: '', message: '', buttons: [] })),
  initialAlertState: { visible: false, title: '', message: '', buttons: [] },
}));

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

const mockSetPassphrase = jest.fn(() => Promise.resolve(true));
const mockChangePassphrase = jest.fn(() => Promise.resolve(true));

jest.mock('../../../src/services/authService', () => ({
  authService: {
    setPassphrase: (...args: any[]) => mockSetPassphrase(...args),
    changePassphrase: (...args: any[]) => mockChangePassphrase(...args),
  },
}));

const mockSetEnabled = jest.fn();
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: jest.fn(() => ({
    setEnabled: mockSetEnabled,
  })),
}));

jest.mock('../../../src/stores', () => ({
  useAppStore: jest.fn((selector?: any) => {
    const state = {
      themeMode: 'system',
    };
    return selector ? selector(state) : state;
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

jest.mock('react-native-vector-icons/Feather', () => {
  const { Text } = require('react-native');
  return ({ name }: any) => <Text>{name}</Text>;
});

import { PassphraseSetupScreen } from '../../../src/screens/PassphraseSetupScreen';

const defaultProps = {
  onComplete: jest.fn(),
  onCancel: jest.fn(),
};

describe('PassphraseSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Rendering tests ----

  it('renders "Set Up Passphrase" title for new setup', () => {
    const { getByText } = render(<PassphraseSetupScreen {...defaultProps} />);
    expect(getByText('Set Up Passphrase')).toBeTruthy();
  });

  it('renders passphrase input fields', () => {
    const { getByPlaceholderText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );
    expect(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
    ).toBeTruthy();
  });

  it('shows confirm passphrase field', () => {
    const { getByPlaceholderText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );
    expect(getByPlaceholderText('Re-enter passphrase')).toBeTruthy();
  });

  it('shows current passphrase field when isChanging=true', () => {
    const { getAllByText, getByText, getByPlaceholderText } = render(
      <PassphraseSetupScreen {...defaultProps} isChanging={true} />,
    );
    expect(getAllByText('Change Passphrase').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Current Passphrase')).toBeTruthy();
    expect(
      getByPlaceholderText('Enter current passphrase'),
    ).toBeTruthy();
  });

  it('cancel button calls onCancel', () => {
    const { getByText } = render(<PassphraseSetupScreen {...defaultProps} />);
    fireEvent.press(getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows "Enable Lock" button text for new setup', () => {
    const { getByText } = render(<PassphraseSetupScreen {...defaultProps} />);
    expect(getByText('Enable Lock')).toBeTruthy();
  });

  it('shows "Change Passphrase" button text when isChanging', () => {
    const { getAllByText } = render(
      <PassphraseSetupScreen {...defaultProps} isChanging />,
    );
    // Title and button both say "Change Passphrase"
    expect(getAllByText('Change Passphrase').length).toBeGreaterThanOrEqual(2);
  });

  it('renders tips section', () => {
    const { getByText } = render(<PassphraseSetupScreen {...defaultProps} />);
    expect(getByText('Tips for a good passphrase:')).toBeTruthy();
    expect(getByText(/Use a mix of words/)).toBeTruthy();
  });

  it('shows description for new setup', () => {
    const { getByText } = render(<PassphraseSetupScreen {...defaultProps} />);
    expect(getByText(/Create a passphrase to lock the app/)).toBeTruthy();
  });

  it('shows description for change mode', () => {
    const { getByText } = render(
      <PassphraseSetupScreen {...defaultProps} isChanging />,
    );
    expect(getByText(/Enter your current passphrase/)).toBeTruthy();
  });

  // ---- Validation tests ----

  it('shows validation error when passphrase is too short', async () => {
    const { getByPlaceholderText, getByText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'abc',
    );
    fireEvent.changeText(getByPlaceholderText('Re-enter passphrase'), 'abc');

    await act(async () => {
      fireEvent.press(getByText('Enable Lock'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Invalid Passphrase',
      'Passphrase must be at least 6 characters',
    );
    expect(mockSetPassphrase).not.toHaveBeenCalled();
  });

  it('shows validation error when passphrase is too long', async () => {
    const longPass = 'a'.repeat(51);
    const { getByPlaceholderText, getByText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      longPass,
    );
    fireEvent.changeText(getByPlaceholderText('Re-enter passphrase'), longPass);

    await act(async () => {
      fireEvent.press(getByText('Enable Lock'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Invalid Passphrase',
      'Passphrase must be 50 characters or less',
    );
    expect(mockSetPassphrase).not.toHaveBeenCalled();
  });

  it('shows mismatch error when passphrases do not match', async () => {
    const { getByPlaceholderText, getByText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'password123',
    );
    fireEvent.changeText(
      getByPlaceholderText('Re-enter passphrase'),
      'differentpassword',
    );

    await act(async () => {
      fireEvent.press(getByText('Enable Lock'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Mismatch',
      'Passphrases do not match',
    );
    expect(mockSetPassphrase).not.toHaveBeenCalled();
  });

  // ---- Successful submit tests ----

  it('calls setPassphrase on valid new setup', async () => {
    mockSetPassphrase.mockResolvedValue(true);

    const { getByPlaceholderText, getByText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'securepass123',
    );
    fireEvent.changeText(
      getByPlaceholderText('Re-enter passphrase'),
      'securepass123',
    );

    await act(async () => {
      fireEvent.press(getByText('Enable Lock'));
    });

    expect(mockSetPassphrase).toHaveBeenCalledWith('securepass123');
    expect(mockSetEnabled).toHaveBeenCalledWith(true);
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it('calls changePassphrase on valid change', async () => {
    mockChangePassphrase.mockResolvedValue(true);

    const { getByPlaceholderText, getAllByText } = render(
      <PassphraseSetupScreen {...defaultProps} isChanging />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter current passphrase'),
      'oldpassword',
    );
    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'newpassword',
    );
    fireEvent.changeText(
      getByPlaceholderText('Re-enter passphrase'),
      'newpassword',
    );

    // Press "Change Passphrase" button (last one)
    const buttons = getAllByText('Change Passphrase');
    await act(async () => {
      fireEvent.press(buttons[buttons.length - 1]);
    });

    expect(mockChangePassphrase).toHaveBeenCalledWith('oldpassword', 'newpassword');
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  // ---- Error handling tests ----

  it('shows error when current passphrase is incorrect on change', async () => {
    mockChangePassphrase.mockResolvedValue(false);

    const { getByPlaceholderText, getAllByText } = render(
      <PassphraseSetupScreen {...defaultProps} isChanging />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter current passphrase'),
      'wrongpassword',
    );
    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'newpassword',
    );
    fireEvent.changeText(
      getByPlaceholderText('Re-enter passphrase'),
      'newpassword',
    );

    const buttons = getAllByText('Change Passphrase');
    await act(async () => {
      fireEvent.press(buttons[buttons.length - 1]);
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Error',
      'Current passphrase is incorrect',
    );
    expect(defaultProps.onComplete).not.toHaveBeenCalled();
  });

  it('shows error when setPassphrase fails', async () => {
    mockSetPassphrase.mockResolvedValue(false);

    const { getByPlaceholderText, getByText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'validpass123',
    );
    fireEvent.changeText(
      getByPlaceholderText('Re-enter passphrase'),
      'validpass123',
    );

    await act(async () => {
      fireEvent.press(getByText('Enable Lock'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Error',
      'Failed to set passphrase',
    );
    expect(defaultProps.onComplete).not.toHaveBeenCalled();
  });

  it('shows generic error when setPassphrase throws', async () => {
    mockSetPassphrase.mockRejectedValue(new Error('Network error'));

    const { getByPlaceholderText, getByText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'validpass123',
    );
    fireEvent.changeText(
      getByPlaceholderText('Re-enter passphrase'),
      'validpass123',
    );

    await act(async () => {
      fireEvent.press(getByText('Enable Lock'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Error',
      'An error occurred. Please try again.',
    );
  });

  it('shows "Saving..." button text while submitting', async () => {
    // Make setPassphrase hang to observe loading state
    let resolveSetPassphrase: (value: boolean) => void;
    mockSetPassphrase.mockImplementation(
      () => new Promise((resolve) => { resolveSetPassphrase = resolve; }),
    );

    const { getByPlaceholderText, getByText, queryByText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'validpass123',
    );
    fireEvent.changeText(
      getByPlaceholderText('Re-enter passphrase'),
      'validpass123',
    );

    // Start submit
    await act(async () => {
      fireEvent.press(getByText('Enable Lock'));
    });

    // During submission, button text changes
    expect(queryByText('Saving...')).toBeTruthy();

    // Resolve
    await act(async () => {
      resolveSetPassphrase!(true);
    });
  });

  it('does not call setEnabled when setting passphrase in change mode', async () => {
    mockChangePassphrase.mockResolvedValue(true);

    const { getByPlaceholderText, getAllByText } = render(
      <PassphraseSetupScreen {...defaultProps} isChanging />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter current passphrase'),
      'oldpass',
    );
    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase (min 6 characters)'),
      'newpass123',
    );
    fireEvent.changeText(
      getByPlaceholderText('Re-enter passphrase'),
      'newpass123',
    );

    const buttons = getAllByText('Change Passphrase');
    await act(async () => {
      fireEvent.press(buttons[buttons.length - 1]);
    });

    // setEnabled should NOT be called in change mode
    expect(mockSetEnabled).not.toHaveBeenCalled();
  });

  it('shows Passphrase label for new setup', () => {
    const { getByText, queryByText } = render(
      <PassphraseSetupScreen {...defaultProps} />,
    );
    expect(getByText('Passphrase')).toBeTruthy();
    expect(queryByText('New Passphrase')).toBeNull();
  });

  it('shows New Passphrase label for change mode', () => {
    const { getByText } = render(
      <PassphraseSetupScreen {...defaultProps} isChanging />,
    );
    expect(getByText('New Passphrase')).toBeTruthy();
  });
});
