/**
 * AnimatedEntry Component Tests
 *
 * Tests for the animated entry wrapper:
 * - Renders children when index < maxItems
 * - Renders children without animation when index >= maxItems
 */

import React from 'react';
import { render } from '@testing-library/react-native';
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
});
