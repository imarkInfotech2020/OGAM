import { renderHook, act } from '@testing-library/react-native';
import { Platform, PermissionsAndroid } from 'react-native';
import { useNotifRationale } from '../../../src/screens/ModelsScreen/useNotifRationale';

// Mock backgroundDownloadService
const mockRequestNotificationPermission = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/services', () => ({
  backgroundDownloadService: {
    get requestNotificationPermission() { return mockRequestNotificationPermission; },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn() },
}));

describe('useNotifRationale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('proceeds immediately when not first download', async () => {
    const proceed = jest.fn();
    const { result } = renderHook(() => useNotifRationale(false));

    await act(async () => {
      await result.current.maybeShowNotifRationale(proceed);
    });

    expect(proceed).toHaveBeenCalled();
    expect(result.current.showNotifRationale).toBe(false);
  });

  it('proceeds immediately on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });

    const proceed = jest.fn();
    const { result } = renderHook(() => useNotifRationale(true));

    await act(async () => {
      await result.current.maybeShowNotifRationale(proceed);
    });

    expect(proceed).toHaveBeenCalled();
    expect(result.current.showNotifRationale).toBe(false);

    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
  });

  it('proceeds immediately on Android < 33', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    Object.defineProperty(Platform, 'Version', { get: () => 32 });

    const proceed = jest.fn();
    const { result } = renderHook(() => useNotifRationale(true));

    await act(async () => {
      await result.current.maybeShowNotifRationale(proceed);
    });

    expect(proceed).toHaveBeenCalled();
    expect(result.current.showNotifRationale).toBe(false);
  });

  it('proceeds immediately when permission already granted', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    Object.defineProperty(Platform, 'Version', { get: () => 33 });
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

    const proceed = jest.fn();
    const { result } = renderHook(() => useNotifRationale(true));

    await act(async () => {
      await result.current.maybeShowNotifRationale(proceed);
    });

    expect(proceed).toHaveBeenCalled();
    expect(result.current.showNotifRationale).toBe(false);
  });

  it('shows rationale on Android 33+ first download without permission', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    Object.defineProperty(Platform, 'Version', { get: () => 33 });
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);

    const proceed = jest.fn();
    const { result } = renderHook(() => useNotifRationale(true));

    await act(async () => {
      await result.current.maybeShowNotifRationale(proceed);
    });

    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.showNotifRationale).toBe(true);
  });

  it('handleNotifRationaleAllow requests permission then proceeds', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    Object.defineProperty(Platform, 'Version', { get: () => 33 });
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);

    const proceed = jest.fn();
    const { result } = renderHook(() => useNotifRationale(true));

    await act(async () => {
      await result.current.maybeShowNotifRationale(proceed);
    });

    expect(result.current.showNotifRationale).toBe(true);

    await act(async () => {
      result.current.handleNotifRationaleAllow();
    });

    // Wait for the async permission request to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRequestNotificationPermission).toHaveBeenCalled();
    expect(proceed).toHaveBeenCalled();
    expect(result.current.showNotifRationale).toBe(false);
  });

  it('handleNotifRationaleDismiss proceeds without requesting permission', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    Object.defineProperty(Platform, 'Version', { get: () => 33 });
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);

    const proceed = jest.fn();
    const { result } = renderHook(() => useNotifRationale(true));

    await act(async () => {
      await result.current.maybeShowNotifRationale(proceed);
    });

    await act(async () => {
      result.current.handleNotifRationaleDismiss();
    });

    expect(mockRequestNotificationPermission).not.toHaveBeenCalled();
    expect(proceed).toHaveBeenCalled();
    expect(result.current.showNotifRationale).toBe(false);
  });
});
