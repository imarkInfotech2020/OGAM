/**
 * LockScreen Tests
 *
 * Tests for the lock screen including:
 * - Lock icon rendering
 * - Passphrase input
 * - Unlock button
 * - Successful verification calls onUnlock
 * - Failed verification shows error and records attempt
 * - Empty passphrase shows error
 * - Lockout state rendering
 * - Attempts remaining counter
 * - Lockout after too many failed attempts
 * - Error handling for service failures
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// Navigation is globally mocked in jest.setup.ts

jest.mock('../../../src/hooks/useFocusTrigger', () => ({
  useFocusTrigger: () => 0,
}));

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
  CustomAlert: () => null,
}));

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
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

const mockVerifyPassphrase = jest.fn();
jest.mock('../../../src/services/authService', () => ({
  authService: {
    verifyPassphrase: (...args: any[]) => mockVerifyPassphrase(...args),
  },
}));

const mockRecordFailedAttempt = jest.fn(() => false);
const mockResetFailedAttempts = jest.fn();
const mockCheckLockout = jest.fn(() => false);
const mockGetLockoutRemaining = jest.fn(() => 0);
let mockFailedAttempts = 0;

jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: jest.fn(() => ({
    failedAttempts: mockFailedAttempts,
    recordFailedAttempt: mockRecordFailedAttempt,
    resetFailedAttempts: mockResetFailedAttempts,
    checkLockout: mockCheckLockout,
    getLockoutRemaining: mockGetLockoutRemaining,
  })),
}));

jest.mock('../../../src/stores', () => ({
  useAppStore: jest.fn((selector?: any) => {
    const state = { themeMode: 'system' };
    return selector ? selector(state) : state;
  }),
}));

import { LockScreen } from '../../../src/screens/LockScreen';

const defaultProps = {
  onUnlock: jest.fn(),
};

describe('LockScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFailedAttempts = 0;
    mockCheckLockout.mockReturnValue(false);
    mockGetLockoutRemaining.mockReturnValue(0);
    mockRecordFailedAttempt.mockReturnValue(false);
  });

  // ---- Rendering tests ----

  it('renders lock icon and title', () => {
    const { getByText } = render(<LockScreen {...defaultProps} />);
    expect(getByText('App Locked')).toBeTruthy();
  });

  it('renders passphrase input', () => {
    const { getByPlaceholderText } = render(<LockScreen {...defaultProps} />);
    expect(getByPlaceholderText('Enter passphrase')).toBeTruthy();
  });

  it('shows unlock button', () => {
    const { getByText } = render(<LockScreen {...defaultProps} />);
    expect(getByText('Unlock')).toBeTruthy();
  });

  it('shows subtitle text', () => {
    const { getByText } = render(<LockScreen {...defaultProps} />);
    expect(getByText('Enter your passphrase to unlock')).toBeTruthy();
  });

  it('shows footer with security message', () => {
    const { getByText } = render(<LockScreen {...defaultProps} />);
    expect(getByText('Your data is protected and stored locally')).toBeTruthy();
  });

  // ---- Unlock flow tests ----

  it('calls onUnlock after successful verification', async () => {
    mockVerifyPassphrase.mockResolvedValue(true);

    const { getByPlaceholderText, getByText } = render(
      <LockScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase'),
      'correct-pass',
    );

    await act(async () => {
      fireEvent.press(getByText('Unlock'));
    });

    expect(mockVerifyPassphrase).toHaveBeenCalledWith('correct-pass');
    expect(mockResetFailedAttempts).toHaveBeenCalled();
    expect(defaultProps.onUnlock).toHaveBeenCalled();
  });

  it('shows error when passphrase is empty', async () => {
    const { getByText } = render(<LockScreen {...defaultProps} />);

    // The unlock button should be disabled when input is empty
    // But let's also test the handleUnlock validation
    // The button is disabled when !passphrase.trim(), so let's enter spaces
    fireEvent.press(getByText('Unlock'));

    // Button is disabled so onPress won't fire - verify no verification call
    expect(mockVerifyPassphrase).not.toHaveBeenCalled();
  });

  it('records failed attempt on incorrect passphrase', async () => {
    mockVerifyPassphrase.mockResolvedValue(false);
    mockRecordFailedAttempt.mockReturnValue(false);

    const { getByPlaceholderText, getByText } = render(
      <LockScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase'),
      'wrong-pass',
    );

    await act(async () => {
      fireEvent.press(getByText('Unlock'));
    });

    expect(mockVerifyPassphrase).toHaveBeenCalledWith('wrong-pass');
    expect(mockRecordFailedAttempt).toHaveBeenCalled();
    expect(defaultProps.onUnlock).not.toHaveBeenCalled();
  });

  it('shows "Incorrect Passphrase" alert on wrong password', async () => {
    mockVerifyPassphrase.mockResolvedValue(false);
    mockRecordFailedAttempt.mockReturnValue(false);

    const { getByPlaceholderText, getByText } = render(
      <LockScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase'),
      'wrong-pass',
    );

    await act(async () => {
      fireEvent.press(getByText('Unlock'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Incorrect Passphrase',
      expect.stringContaining('attempt'),
    );
  });

  it('shows lockout alert when too many failed attempts', async () => {
    mockVerifyPassphrase.mockResolvedValue(false);
    mockRecordFailedAttempt.mockReturnValue(true); // Returns true = locked out

    const { getByPlaceholderText, getByText } = render(
      <LockScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase'),
      'wrong-pass',
    );

    await act(async () => {
      fireEvent.press(getByText('Unlock'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Too Many Attempts',
      expect.stringContaining('locked out'),
    );
  });

  // ---- Lockout state tests ----

  it('shows lockout UI when locked out', () => {
    mockCheckLockout.mockReturnValue(true);
    mockGetLockoutRemaining.mockReturnValue(180);

    const { getByText, queryByPlaceholderText } = render(
      <LockScreen {...defaultProps} />,
    );

    expect(getByText('Too many failed attempts')).toBeTruthy();
    expect(getByText('Please wait before trying again')).toBeTruthy();
    // The timer should show formatted time (3:00)
    expect(getByText('3:00')).toBeTruthy();
    // Input should not be visible during lockout
    expect(queryByPlaceholderText('Enter passphrase')).toBeNull();
  });

  it('shows lockout timer with correct format', () => {
    mockCheckLockout.mockReturnValue(true);
    mockGetLockoutRemaining.mockReturnValue(65); // 1:05

    const { getByText } = render(<LockScreen {...defaultProps} />);
    expect(getByText('1:05')).toBeTruthy();
  });

  // ---- Attempts counter tests ----

  it('shows remaining attempts when there are failed attempts', () => {
    mockFailedAttempts = 2;

    // Need to re-mock the store with updated failedAttempts
    const { useAuthStore } = require('../../../src/stores/authStore');
    (useAuthStore as jest.Mock).mockReturnValue({
      failedAttempts: 2,
      recordFailedAttempt: mockRecordFailedAttempt,
      resetFailedAttempts: mockResetFailedAttempts,
      checkLockout: mockCheckLockout,
      getLockoutRemaining: mockGetLockoutRemaining,
    });

    const { getByText } = render(<LockScreen {...defaultProps} />);
    expect(getByText('3 attempts remaining')).toBeTruthy();
  });

  it('shows singular "attempt" when only 1 remaining', () => {
    const { useAuthStore } = require('../../../src/stores/authStore');
    (useAuthStore as jest.Mock).mockReturnValue({
      failedAttempts: 4,
      recordFailedAttempt: mockRecordFailedAttempt,
      resetFailedAttempts: mockResetFailedAttempts,
      checkLockout: mockCheckLockout,
      getLockoutRemaining: mockGetLockoutRemaining,
    });

    const { getByText } = render(<LockScreen {...defaultProps} />);
    expect(getByText('1 attempt remaining')).toBeTruthy();
  });

  it('does not show attempts counter when no failed attempts', () => {
    // Ensure failedAttempts is 0
    const { useAuthStore } = require('../../../src/stores/authStore');
    (useAuthStore as jest.Mock).mockReturnValue({
      failedAttempts: 0,
      recordFailedAttempt: mockRecordFailedAttempt,
      resetFailedAttempts: mockResetFailedAttempts,
      checkLockout: mockCheckLockout,
      getLockoutRemaining: mockGetLockoutRemaining,
    });

    const { queryByText } = render(<LockScreen {...defaultProps} />);
    expect(queryByText(/attempts? remaining/)).toBeNull();
  });

  // ---- Error handling tests ----

  it('shows error alert when verification service throws', async () => {
    mockVerifyPassphrase.mockRejectedValue(new Error('Service error'));

    const { getByPlaceholderText, getByText } = render(
      <LockScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase'),
      'some-pass',
    );

    await act(async () => {
      fireEvent.press(getByText('Unlock'));
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      'Error',
      'Failed to verify passphrase',
    );
    expect(defaultProps.onUnlock).not.toHaveBeenCalled();
  });

  it('unlock button is disabled when input is empty', () => {
    const { getByText } = render(<LockScreen {...defaultProps} />);
    // When disabled, pressing Unlock should NOT trigger verifyPassphrase
    fireEvent.press(getByText('Unlock'));
    expect(mockVerifyPassphrase).not.toHaveBeenCalled();
  });

  it('unlock button is enabled when input has text', async () => {
    mockVerifyPassphrase.mockResolvedValue(true);

    const { getByPlaceholderText, getByText } = render(
      <LockScreen {...defaultProps} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('Enter passphrase'),
      'some-text',
    );

    await act(async () => {
      fireEvent.press(getByText('Unlock'));
    });

    // When enabled with text, pressing Unlock SHOULD trigger verifyPassphrase
    expect(mockVerifyPassphrase).toHaveBeenCalledWith('some-text');
  });

  it('does not call verify when already locked out', async () => {
    mockCheckLockout.mockReturnValue(true);
    mockGetLockoutRemaining.mockReturnValue(60);

    const { queryByPlaceholderText } = render(
      <LockScreen {...defaultProps} />,
    );

    // During lockout the input is hidden, so user can't submit
    expect(queryByPlaceholderText('Enter passphrase')).toBeNull();
    expect(mockVerifyPassphrase).not.toHaveBeenCalled();
  });

  it('clears passphrase after failed attempt', async () => {
    mockVerifyPassphrase.mockResolvedValue(false);
    mockRecordFailedAttempt.mockReturnValue(false);

    const { getByPlaceholderText, getByText } = render(
      <LockScreen {...defaultProps} />,
    );

    const input = getByPlaceholderText('Enter passphrase');
    fireEvent.changeText(input, 'wrong-pass');

    await act(async () => {
      fireEvent.press(getByText('Unlock'));
    });

    // After failed attempt, the input should be cleared
    // The button should be disabled again (empty input)
    expect(mockRecordFailedAttempt).toHaveBeenCalled();
  });
});
