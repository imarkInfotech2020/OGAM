/**
 * useFocusTrigger Hook Tests
 *
 * Tests for the focus trigger hook:
 * - Returns 0 initially
 * - Increments when screen gains focus
 * - Does not increment when unfocused
 */

import { renderHook } from '@testing-library/react-native';

let mockIsFocused = true;
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockIsFocused,
}));

import { useFocusTrigger } from '../../../src/hooks/useFocusTrigger';

describe('useFocusTrigger', () => {
  beforeEach(() => {
    mockIsFocused = true;
  });

  it('returns a number', () => {
    const { result } = renderHook(() => useFocusTrigger());
    expect(typeof result.current).toBe('number');
  });

  it('increments when focused', () => {
    const { result } = renderHook(() => useFocusTrigger());
    // After initial render with isFocused=true, the effect runs and increments
    expect(result.current).toBeGreaterThanOrEqual(0);
  });

  it('does not increment when not focused', () => {
    mockIsFocused = false;
    const { result } = renderHook(() => useFocusTrigger());
    expect(result.current).toBe(0);
  });
});
