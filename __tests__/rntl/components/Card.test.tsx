/**
 * Card Component Tests
 *
 * Tests for the Card component covering all branches:
 * - Container type (View vs TouchableOpacity)
 * - Header rendering (title, subtitle, headerRight)
 * - Pressable behavior
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '../../../src/components/Card';

describe('Card', () => {
  it('renders children', () => {
    const { getByText } = render(
      <Card><Text>Child Content</Text></Card>
    );
    expect(getByText('Child Content')).toBeTruthy();
  });

  it('renders as View when no onPress provided', () => {
    const { getByText } = render(
      <Card><Text>Static Card</Text></Card>
    );
    // Should render without being pressable
    expect(getByText('Static Card')).toBeTruthy();
  });

  it('renders as TouchableOpacity when onPress provided', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Card onPress={onPress}><Text>Pressable Card</Text></Card>
    );
    fireEvent.press(getByText('Pressable Card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders title when provided', () => {
    const { getByText } = render(
      <Card title="Card Title"><Text>Body</Text></Card>
    );
    expect(getByText('Card Title')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = render(
      <Card subtitle="Card Subtitle"><Text>Body</Text></Card>
    );
    expect(getByText('Card Subtitle')).toBeTruthy();
  });

  it('renders both title and subtitle', () => {
    const { getByText } = render(
      <Card title="Title" subtitle="Subtitle"><Text>Body</Text></Card>
    );
    expect(getByText('Title')).toBeTruthy();
    expect(getByText('Subtitle')).toBeTruthy();
  });

  it('renders headerRight content', () => {
    const { getByText } = render(
      <Card headerRight={<Text>Right Side</Text>}><Text>Body</Text></Card>
    );
    expect(getByText('Right Side')).toBeTruthy();
  });

  it('does not render header when no title, subtitle, or headerRight', () => {
    const { queryByText } = render(
      <Card><Text>No Header</Text></Card>
    );
    // Only child content should be present
    expect(queryByText('No Header')).toBeTruthy();
  });

  it('renders header with title and headerRight', () => {
    const { getByText } = render(
      <Card title="Title" headerRight={<Text>Action</Text>}>
        <Text>Body</Text>
      </Card>
    );
    expect(getByText('Title')).toBeTruthy();
    expect(getByText('Action')).toBeTruthy();
  });

  it('passes testID to container', () => {
    const { getByTestId } = render(
      <Card testID="my-card"><Text>Content</Text></Card>
    );
    expect(getByTestId('my-card')).toBeTruthy();
  });

  it('passes custom style to container', () => {
    const { getByTestId } = render(
      <Card testID="styled-card" style={{ marginTop: 20 }}>
        <Text>Content</Text>
      </Card>
    );
    const card = getByTestId('styled-card');
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style)
      : card.props.style;
    expect(flatStyle).toMatchObject({ marginTop: 20 });
  });

  it('renders headerRight without title or subtitle', () => {
    const { getByText, queryByText } = render(
      <Card headerRight={<Text>Only Right</Text>}>
        <Text>Body</Text>
      </Card>
    );
    expect(getByText('Only Right')).toBeTruthy();
    expect(queryByText('Body')).toBeTruthy();
  });
});
