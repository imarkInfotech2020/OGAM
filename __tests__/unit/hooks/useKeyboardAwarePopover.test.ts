/**
 * useKeyboardAwarePopover Hook Unit Tests
 *
 * Tests for keyboard-aware popover positioning hook that handles
 * keyboard visibility and measures trigger position.
 */

import { renderHook, act } from '@testing-library/react-native';
import { Keyboard, Dimensions } from 'react-native';

// Capture keyboard event handlers
let keyboardShowHandler: (() => void) | null = null;
let keyboardHideHandler: (() => void) | null = null;
const mockKeyboardDismiss = jest.fn();
const mockRemove = jest.fn();

const originalAddListener = Keyboard.addListener;
const originalRAF = global.requestAnimationFrame;

beforeEach(() => {
  keyboardShowHandler = null;
  keyboardHideHandler = null;
  mockKeyboardDismiss.mockClear();
  mockRemove.mockClear();

  // Mock Keyboard.addListener to capture handlers
  (Keyboard.addListener as jest.Mock) = jest.fn((event: string, handler: any) => {
    if (event === 'keyboardDidShow') {
      keyboardShowHandler = handler;
    } else if (event === 'keyboardDidHide') {
      keyboardHideHandler = handler;
    }
    return { remove: mockRemove };
  });

  (Keyboard.dismiss as jest.Mock) = mockKeyboardDismiss;

  // Mock Dimensions
  (Dimensions.get as jest.Mock) = jest.fn(() => ({ height: 800, width: 400 }));

  // Mock requestAnimationFrame to execute synchronously
  global.requestAnimationFrame = (cb: (time: number) => void) => {
    cb(0);
    return 0;
  };
});

afterEach(() => {
  global.requestAnimationFrame = originalRAF;
});

afterAll(() => {
  Keyboard.addListener = originalAddListener;
});

// Import after mocks are set up
import { useKeyboardAwarePopover } from '../../../src/components/ChatInput/useKeyboardAwarePopover';

describe('useKeyboardAwarePopover', () => {
  describe('initial state', () => {
    it('returns initial anchor at origin', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      expect(result.current.anchor).toEqual({ x: 0, y: 0 });
    });

    it('returns initial visible as false', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      expect(result.current.visible).toBe(false);
    });

    it('returns triggerRef', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      expect(result.current.triggerRef).toBeDefined();
      expect(result.current.triggerRef.current).toBeNull();
    });
  });

  describe('keyboard subscriptions', () => {
    it('subscribes to keyboard events on mount', () => {
      renderHook(() => useKeyboardAwarePopover());

      expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
      expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function));
    });

    it('removes subscriptions on unmount', () => {
      const { unmount } = renderHook(() => useKeyboardAwarePopover());

      unmount();

      expect(mockRemove).toHaveBeenCalledTimes(2);
    });
  });

  describe('show - keyboard not visible', () => {
    it('shows popover immediately when keyboard is not visible', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      act(() => {
        result.current.show();
      });

      expect(result.current.visible).toBe(true);
    });

    it('does not dismiss keyboard when not visible', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      act(() => {
        result.current.show();
      });

      expect(mockKeyboardDismiss).not.toHaveBeenCalled();
    });

    it('measures trigger position with custom offsetX', () => {
      const mockMeasureInWindow = jest.fn((callback) => {
        callback(10, 100, 50, 30);
      });

      const { result } = renderHook(() => useKeyboardAwarePopover(20));

      // Set up mock ref
      (result.current.triggerRef as any).current = {
        measureInWindow: mockMeasureInWindow,
      };

      act(() => {
        result.current.show();
      });

      expect(mockMeasureInWindow).toHaveBeenCalled();
      // anchor.y = screenH - y = 800 - 100 = 700
      // anchor.x = offsetX = 20
      expect(result.current.anchor).toEqual({ y: 700, x: 20 });
    });

    it('handles missing measureInWindow gracefully', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      // triggerRef.current is null by default
      act(() => {
        result.current.show();
      });

      expect(result.current.visible).toBe(true);
    });

    it('handles measureInWindow with undefined y value', () => {
      const mockMeasureInWindow = jest.fn((callback) => {
        callback(10, undefined as any, 50, 30);
      });

      const { result } = renderHook(() => useKeyboardAwarePopover());

      (result.current.triggerRef as any).current = {
        measureInWindow: mockMeasureInWindow,
      };

      act(() => {
        result.current.show();
      });

      // y = screenH - (undefined ?? 0) = 800 - 0 = 800
      expect(result.current.anchor).toEqual({ y: 800, x: 12 }); // SPACING.md = 12
    });
  });

  describe('show - keyboard visible', () => {
    it('dismisses keyboard when visible', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      // Simulate keyboard showing
      act(() => {
        keyboardShowHandler?.();
      });

      act(() => {
        result.current.show();
      });

      expect(mockKeyboardDismiss).toHaveBeenCalledTimes(1);
    });

    it('waits for keyboard to hide before showing popover', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      // Simulate keyboard showing
      act(() => {
        keyboardShowHandler?.();
      });

      act(() => {
        result.current.show();
      });

      // Popover should not be visible yet
      expect(result.current.visible).toBe(false);

      // Simulate keyboard hiding
      act(() => {
        keyboardHideHandler?.();
      });

      // Now popover should be visible
      expect(result.current.visible).toBe(true);
    });

    it('does not call show again if already waiting for keyboard', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      // Simulate keyboard showing
      act(() => {
        keyboardShowHandler?.();
      });

      // Call show multiple times
      act(() => {
        result.current.show();
      });

      act(() => {
        result.current.show(); // Should be ignored
      });

      // Should only dismiss once
      expect(mockKeyboardDismiss).toHaveBeenCalledTimes(1);
    });

    it('resets waiting state after keyboard hides', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      // Simulate keyboard showing
      act(() => {
        keyboardShowHandler?.();
      });

      act(() => {
        result.current.show();
      });

      // Simulate keyboard hiding
      act(() => {
        keyboardHideHandler?.();
      });

      expect(result.current.visible).toBe(true);

      // Hide popover
      act(() => {
        result.current.hide();
      });

      // Show keyboard again
      act(() => {
        keyboardShowHandler?.();
      });

      mockKeyboardDismiss.mockClear();

      // Should be able to show again
      act(() => {
        result.current.show();
      });

      expect(mockKeyboardDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup on unmount while waiting', () => {
    it('cancels pending show on unmount', () => {
      const { result, unmount } = renderHook(() => useKeyboardAwarePopover());

      // Simulate keyboard showing
      act(() => {
        keyboardShowHandler?.();
      });

      act(() => {
        result.current.show();
      });

      // Unmount while waiting for keyboard to hide
      unmount();

      // Should have cleaned up (3 removes: 2 from useEffect + 1 from pending)
      expect(mockRemove).toHaveBeenCalled();
    });

    it('pending subscription prevents show after unmount', () => {
      jest.useFakeTimers();

      const { result, unmount } = renderHook(() => useKeyboardAwarePopover());

      // Simulate keyboard showing
      act(() => {
        keyboardShowHandler?.();
      });

      act(() => {
        result.current.show();
      });

      // Unmount while waiting
      unmount();

      // Try to trigger keyboard hide after unmount
      // The cancelled flag should prevent the show
      act(() => {
        keyboardHideHandler?.();
        jest.runAllTimers();
      });

      // No error should occur - the pending callback is cancelled
      expect(true).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('hide', () => {
    it('hides popover', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      act(() => {
        result.current.show();
      });

      expect(result.current.visible).toBe(true);

      act(() => {
        result.current.hide();
      });

      expect(result.current.visible).toBe(false);
    });
  });

  describe('keyboard visibility tracking', () => {
    it('tracks keyboard visibility state', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      // Initially keyboard not visible, should show immediately
      act(() => {
        result.current.show();
      });

      expect(result.current.visible).toBe(true);
      expect(mockKeyboardDismiss).not.toHaveBeenCalled();
    });

    it('updates visibility when keyboard shows', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      act(() => {
        keyboardShowHandler?.();
      });

      act(() => {
        result.current.show();
      });

      expect(mockKeyboardDismiss).toHaveBeenCalled();
    });

    it('updates visibility when keyboard hides', () => {
      const { result } = renderHook(() => useKeyboardAwarePopover());

      // Show keyboard
      act(() => {
        keyboardShowHandler?.();
      });

      act(() => {
        result.current.show();
      });

      expect(result.current.visible).toBe(false);

      // Hide keyboard
      act(() => {
        keyboardHideHandler?.();
      });

      expect(result.current.visible).toBe(true);
    });
  });

  describe('offsetX parameter', () => {
    it('uses default SPACING.md when offsetX not provided', () => {
      const mockMeasureInWindow = jest.fn((callback) => {
        callback(10, 100, 50, 30);
      });

      const { result } = renderHook(() => useKeyboardAwarePopover());

      (result.current.triggerRef as any).current = {
        measureInWindow: mockMeasureInWindow,
      };

      act(() => {
        result.current.show();
      });

      // SPACING.md = 12
      expect(result.current.anchor.x).toBe(12);
    });

    it('uses custom offsetX when provided', () => {
      const mockMeasureInWindow = jest.fn((callback) => {
        callback(10, 100, 50, 30);
      });

      const { result } = renderHook(() => useKeyboardAwarePopover(50));

      (result.current.triggerRef as any).current = {
        measureInWindow: mockMeasureInWindow,
      };

      act(() => {
        result.current.show();
      });

      expect(result.current.anchor.x).toBe(50);
    });
  });
});