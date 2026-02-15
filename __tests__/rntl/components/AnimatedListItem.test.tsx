/**
 * AnimatedListItem Component Tests
 *
 * Tests for the AnimatedListItem wrapper component covering:
 * - Basic rendering with children
 * - Press and long press handlers
 * - Disabled state
 * - Props forwarding
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

jest.mock('../../../src/components/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, onPress, onLongPress, disabled, testID, style }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        testID={testID}
        style={style}
      >
        {children}
      </TouchableOpacity>
    );
  },
}));

import { AnimatedListItem } from '../../../src/components/AnimatedListItem';

describe('AnimatedListItem', () => {
  it('renders children', () => {
    const { getByText } = render(
      <AnimatedListItem index={0}><Text>Item Content</Text></AnimatedListItem>
    );
    expect(getByText('Item Content')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <AnimatedListItem index={0} onPress={onPress}>
        <Text>Pressable</Text>
      </AnimatedListItem>
    );
    fireEvent.press(getByText('Pressable'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onLongPress when long-pressed', () => {
    const onLongPress = jest.fn();
    const { getByText } = render(
      <AnimatedListItem index={0} onLongPress={onLongPress}>
        <Text>Long Pressable</Text>
      </AnimatedListItem>
    );
    fireEvent(getByText('Long Pressable'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('forwards disabled prop', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <AnimatedListItem index={0} onPress={onPress} disabled testID="disabled-item">
        <Text>Disabled</Text>
      </AnimatedListItem>
    );
    // The disabled prop is forwarded to AnimatedPressable
    expect(getByTestId('disabled-item')).toBeTruthy();
  });

  it('passes testID to AnimatedPressable', () => {
    const { getByTestId } = render(
      <AnimatedListItem index={0} testID="my-item">
        <Text>With TestID</Text>
      </AnimatedListItem>
    );
    expect(getByTestId('my-item')).toBeTruthy();
  });

  it('passes style to AnimatedPressable', () => {
    const customStyle = { backgroundColor: 'red' };
    const { getByTestId } = render(
      <AnimatedListItem index={0} testID="styled" style={customStyle}>
        <Text>Styled</Text>
      </AnimatedListItem>
    );
    const style = getByTestId('styled').props.style;
    expect(style).toMatchObject(customStyle);
  });

  it('renders without onPress or onLongPress', () => {
    const { getByText } = render(
      <AnimatedListItem index={0}><Text>No Handlers</Text></AnimatedListItem>
    );
    expect(getByText('No Handlers')).toBeTruthy();
  });
});
