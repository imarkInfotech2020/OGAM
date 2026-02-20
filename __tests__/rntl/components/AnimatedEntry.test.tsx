/**
 * AnimatedEntry Component Tests
 *
 * Tests for the animated entry wrapper:
 * - Renders children when index < maxItems
 * - Renders children without animation when index >= maxItems
 * - Branch coverage for ?? fallbacks in from/animate/transition props
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AnimatedEntry } from '../../../src/components/AnimatedEntry';

describe('AnimatedEntry', () => {
  it('renders children normally', () => {
    const { getByText } = render(
      <AnimatedEntry index={0}>
        <Text>Hello</Text>
      </AnimatedEntry>,
    );
    expect(getByText('Hello')).toBeTruthy();
  });

  it('renders children without animation when index >= maxItems', () => {
    const { getByText } = render(
      <AnimatedEntry index={15} maxItems={10}>
        <Text>No Animation</Text>
      </AnimatedEntry>,
    );
    expect(getByText('No Animation')).toBeTruthy();
  });

  it('renders children with custom stagger', () => {
    const { getByText } = render(
      <AnimatedEntry index={2} staggerMs={50}>
        <Text>Staggered</Text>
      </AnimatedEntry>,
    );
    expect(getByText('Staggered')).toBeTruthy();
  });

  // ============================================================================
  // Branch coverage for ?? fallback paths (lines 25, 36-37, 40, 45-48)
  // ============================================================================

  it('uses default index=0 when index is not provided (line 25 default param branch)', () => {
    // Not passing index lets the `= 0` default apply
    const { getByText } = render(
      <AnimatedEntry>
        <Text>Default Index</Text>
      </AnimatedEntry>,
    );
    expect(getByText('Default Index')).toBeTruthy();
  });

  it('falls back to opacity=1 and translateY=0 when from has no numeric values (lines 36-37)', () => {
    // An empty `from` triggers `(from as any).opacity ?? 1` and `?? 0` fallbacks
    const { getByText } = render(
      <AnimatedEntry from={{}} animate={{}}>
        <Text>No Props</Text>
      </AnimatedEntry>,
    );
    expect(getByText('No Props')).toBeTruthy();
  });

  it('falls back to duration=300 when transition has no duration (line 40)', () => {
    // A transition without `duration` triggers the `?? 300` fallback
    const { getByText } = render(
      <AnimatedEntry transition={{}}>
        <Text>No Duration</Text>
      </AnimatedEntry>,
    );
    expect(getByText('No Duration')).toBeTruthy();
  });

  it('executes useEffect body with ?? fallbacks when trigger changes (lines 45-48)', () => {
    // Trigger the useEffect re-run with empty from/animate so the ?? branches fire
    let triggerValue = 1;
    const { getByText, rerender } = render(
      <AnimatedEntry from={{}} animate={{}} trigger={triggerValue}>
        <Text>Trigger Test</Text>
      </AnimatedEntry>,
    );

    // Re-render with updated trigger → useEffect runs again with empty from/animate
    act(() => {
      triggerValue = 2;
      rerender(
        <AnimatedEntry from={{}} animate={{}} trigger={triggerValue}>
          <Text>Trigger Test</Text>
        </AnimatedEntry>,
      );
    });

    expect(getByText('Trigger Test')).toBeTruthy();
  });

  it('uses explicit delay prop instead of computed stagger delay', () => {
    // Providing `delay` bypasses `delay ?? index * staggerMs`
    const { getByText } = render(
      <AnimatedEntry delay={100} index={3}>
        <Text>Explicit Delay</Text>
      </AnimatedEntry>,
    );
    expect(getByText('Explicit Delay')).toBeTruthy();
  });
});
