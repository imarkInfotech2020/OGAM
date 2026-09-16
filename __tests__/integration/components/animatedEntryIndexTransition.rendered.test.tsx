import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { AnimatedEntry } from '../../../src/components/AnimatedEntry';

describe('AnimatedEntry index transitions', () => {
  it('keeps a row visible when deletion moves it into the animated range', async () => {
    const view = render(
      <AnimatedEntry index={10} maxItems={10}>
        <Text>Remaining chat</Text>
      </AnimatedEntry>,
    );

    expect(view.getByText('Remaining chat')).toBeVisible();

    view.rerender(
      <AnimatedEntry index={8} maxItems={10}>
        <Text>Remaining chat</Text>
      </AnimatedEntry>,
    );

    await waitFor(() => expect(view.getByText('Remaining chat')).toBeVisible());
  });
});
