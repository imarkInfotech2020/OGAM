/**
 * useAppState Hook Unit Tests
 *
 * Tests for the AppState listener hook that fires callbacks
 * on foreground/background transitions.
 */

import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';

// Capture the event handler registered via addEventListener
let appStateChangeHandler: ((state: string) => void) | null = null;
const mockRemove = jest.fn();

const originalAddEventListener = AppState.addEventListener;

beforeEach(() => {
  appStateChangeHandler = null;
  mockRemove.mockClear();

  // Override addEventListener to capture the handler
  AppState.addEventListener = jest.fn((event: string, handler: any) => {
    if (event === 'change') {
      appStateChangeHandler = handler;
    }
    return { remove: mockRemove };
  }) as any;

  // Set initial state to 'active'
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  AppState.addEventListener = originalAddEventListener;
});

// Import after mocks are set up
import { useAppState } from '../../../src/hooks/useAppState';

describe('useAppState', () => {
  it('returns current app state', () => {
    const { result } = renderHook(() =>
      useAppState({ onForeground: jest.fn(), onBackground: jest.fn() }),
    );

    expect(result.current.currentState).toBe('active');
  });

  it('subscribes to AppState change events on mount', () => {
    renderHook(() => useAppState({}));

    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes subscription on unmount', () => {
    const { unmount } = renderHook(() => useAppState({}));

    unmount();

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('calls onBackground when transitioning from active to background', () => {
    const onBackground = jest.fn();
    renderHook(() => useAppState({ onBackground }));

    act(() => {
      appStateChangeHandler?.('background');
    });

    expect(onBackground).toHaveBeenCalledTimes(1);
  });

  it('calls onBackground when transitioning from active to inactive', () => {
    const onBackground = jest.fn();
    renderHook(() => useAppState({ onBackground }));

    act(() => {
      appStateChangeHandler?.('inactive');
    });

    expect(onBackground).toHaveBeenCalledTimes(1);
  });

  it('calls onForeground when transitioning from background to active', () => {
    const onForeground = jest.fn();
    renderHook(() => useAppState({ onForeground }));

    // First go to background
    act(() => {
      appStateChangeHandler?.('background');
    });

    // Then come back to active
    act(() => {
      appStateChangeHandler?.('active');
    });

    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('calls onForeground when transitioning from inactive to active', () => {
    const onForeground = jest.fn();
    renderHook(() => useAppState({ onForeground }));

    // First go to inactive
    act(() => {
      appStateChangeHandler?.('inactive');
    });

    // Then come back to active
    act(() => {
      appStateChangeHandler?.('active');
    });

    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('does not call onForeground when staying active', () => {
    const onForeground = jest.fn();
    renderHook(() => useAppState({ onForeground }));

    act(() => {
      appStateChangeHandler?.('active');
    });

    expect(onForeground).not.toHaveBeenCalled();
  });

  it('does not call onBackground when going from background to inactive', () => {
    const onBackground = jest.fn();
    renderHook(() => useAppState({ onBackground }));

    // Go to background first
    act(() => {
      appStateChangeHandler?.('background');
    });
    onBackground.mockClear();

    // Then to inactive (background -> inactive should not trigger onBackground again)
    act(() => {
      appStateChangeHandler?.('inactive');
    });

    expect(onBackground).not.toHaveBeenCalled();
  });

  it('does not throw when callbacks are not provided', () => {
    renderHook(() => useAppState({}));

    expect(() => {
      act(() => {
        appStateChangeHandler?.('background');
      });
    }).not.toThrow();

    expect(() => {
      act(() => {
        appStateChangeHandler?.('active');
      });
    }).not.toThrow();
  });
});
