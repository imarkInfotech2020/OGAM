/**
 * ProDetailScreen Tests
 */

import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useAppStore } from '../../../src/stores/appStore';

const mockActivateProByEmail = jest.fn();
const mockGetWebPurchaseUrl = jest.fn((..._args: unknown[]) => 'https://pay.rev.cat/token/buyer%40example.com?email=buyer%40example.com');
const mockResetProIdentityForTesting = jest.fn();

jest.mock('../../../src/services/proLicenseService', () => ({
  activateProByEmail: (...args: unknown[]) => mockActivateProByEmail(...args),
  getWebPurchaseUrl: (...args: unknown[]) => mockGetWebPurchaseUrl(...args),
  resetProIdentityForTesting: (...args: unknown[]) => mockResetProIdentityForTesting(...args),
}));

import { ProDetailScreen } from '../../../src/screens/ProDetailScreen';

describe('ProDetailScreen', () => {
  let alertSpy: jest.SpyInstance;
  let linkingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({ hasRegisteredPro: false });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    linkingSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    linkingSpy.mockRestore();
  });

  it('renders the Get Pro call-to-action when the user is not Pro', () => {
    const { queryAllByText } = render(<ProDetailScreen />);
    expect(queryAllByText('Get Pro').length).toBeGreaterThan(0);
  });

  it('"Already paid? Unlock with email" opens the modal directly in verify mode', () => {
    const { getByText, queryByText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already paid? Unlock with email'));
    // Lands straight on email verification — no second "Already paid?" toggle needed.
    expect(getByText('Verify and unlock')).toBeTruthy();
    expect(getByText('Enter the email you used when you paid.')).toBeTruthy();
    expect(queryByText('Continue to payment')).toBeNull();
  });

  it('the Get Pro CTA opens the modal in pay mode', () => {
    const { getAllByText, getByText, queryByText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    expect(getByText('Continue to payment')).toBeTruthy();
    expect(queryByText('Verify and unlock')).toBeNull();
  });

  it('opens web checkout with the entered email', async () => {
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    fireEvent.press(getByText('Continue to payment'));
    await waitFor(() => expect(mockGetWebPurchaseUrl).toHaveBeenCalledWith('buyer@example.com'));
    expect(linkingSpy).toHaveBeenCalledWith('https://pay.rev.cat/token/buyer%40example.com?email=buyer%40example.com');
  });

  it('shows inline success state on a successful verify', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(true);
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    // Switch to verify mode first
    fireEvent.press(getByText('Already paid? Verify email instead'));
    fireEvent.press(getByText('Verify and unlock'));
    await waitFor(() => expect(mockActivateProByEmail).toHaveBeenCalledWith('buyer@example.com'));
    await waitFor(() => expect(getByText('Pro activated')).toBeTruthy());
  });

  it('lets the user dismiss the success card with Got it', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(true);
    const { getAllByText, getByText, queryByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    fireEvent.press(getByText('Already paid? Verify email instead'));
    fireEvent.press(getByText('Verify and unlock'));
    await waitFor(() => expect(getByText('Pro activated')).toBeTruthy());
    fireEvent.press(getByText('Got it'));
    await waitFor(() => expect(queryByText('Pro activated')).toBeNull());
  });

  it('shows inline error when no purchase is found for that email', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(false);
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'nope@example.com');
    fireEvent.press(getByText('Already paid? Verify email instead'));
    fireEvent.press(getByText('Verify and unlock'));
    await waitFor(() => expect(getByText(/No Pro purchase found/)).toBeTruthy());
  });

  it('keeps the checkout button disabled until text is entered', async () => {
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    // Empty input: the disabled button ignores the press, no checkout opens.
    fireEvent.press(getByText('Continue to payment'));
    expect(linkingSpy).not.toHaveBeenCalled();
    // Once text is entered the button is enabled and opens checkout.
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    fireEvent.press(getByText('Continue to payment'));
    await waitFor(() => expect(linkingSpy).toHaveBeenCalled());
  });

  it('treats whitespace-only input as empty so the button stays disabled', () => {
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), '   ');
    fireEvent.press(getByText('Continue to payment'));
    expect(linkingSpy).not.toHaveBeenCalled();
  });

  it('strips surrounding whitespace before opening checkout', async () => {
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), '  buyer@example.com  ');
    fireEvent.press(getByText('Continue to payment'));
    await waitFor(() => expect(mockGetWebPurchaseUrl).toHaveBeenCalledWith('buyer@example.com'));
  });

  it('renders the Pro Active state when the user already owns Pro', () => {
    useAppStore.setState({ hasRegisteredPro: true });
    const { getByText } = render(<ProDetailScreen />);
    expect(getByText('Pro Active')).toBeTruthy();
    expect(getByText('Pro is active on this account.')).toBeTruthy();
  });

  it('runs the reset and confirms when the Pro user taps Reset Pro identity', async () => {
    useAppStore.setState({ hasRegisteredPro: true });
    mockResetProIdentityForTesting.mockResolvedValueOnce(undefined);
    const { getByText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Reset Pro identity'));
    await waitFor(() => expect(mockResetProIdentityForTesting).toHaveBeenCalledTimes(1));
    expect(alertSpy).toHaveBeenCalledWith('Reset done', expect.any(String));
  });
});
