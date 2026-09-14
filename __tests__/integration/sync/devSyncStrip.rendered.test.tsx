import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import logger from '../../../src/utils/logger';

describe('development sync strip', () => {
  it('shows the running sync step and opens the recorded sync history', () => {
    jest.useFakeTimers();
    const { DevSyncStrip } = require('../../../App');
    const view = render(
      <SafeAreaProvider>
        <DevSyncStrip />
      </SafeAreaProvider>,
    );

    act(() => logger.log('[BOOT-SYNC] chat repair start'));
    expect(screen.getByText(/Sync: chat repair start/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('dev-sync-strip'));
    expect(screen.getByText('Sync Debug Logs')).toBeTruthy();
    fireEvent.press(screen.getByText('Startup'));
    expect(screen.getByText('[BOOT-SYNC] chat repair start')).toBeTruthy();

    view.unmount();
    jest.useRealTimers();
  });
});
