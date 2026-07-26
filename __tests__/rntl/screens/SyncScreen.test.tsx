/**
 * SyncScreen: the user-facing Sync surface. Verifies it starts the engine on mount, renders this
 * device + discovered peers, gates pairing on a code, and dials the tapped device with that code.
 * syncService is mocked (it imports native modules); the screen's own logic + store wiring is real.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useSyncStore } from '../../../src/stores/syncStore';
import { SyncScreen } from '../../../src/screens/SyncScreen';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}));
jest.mock('../../../src/theme', () => ({
  useTheme: () => ({ colors: { background: '#000', text: '#fff', textSecondary: '#aaa', textMuted: '#666', surfaceLight: '#222', border: '#333', primary: '#0a0' } }),
  useThemedStyles: (fn: any) => fn({ background: '#000', text: '#fff', textSecondary: '#aaa', textMuted: '#666', surfaceLight: '#222', border: '#333', primary: '#0a0' }, {}),
}));
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockPair = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/services/sync/syncService', () => ({
  syncService: { start: (...a: any[]) => mockStart(...a), stop: (...a: any[]) => mockStop(...a), pair: (...a: any[]) => mockPair(...a) },
}));

const disc = (id: string) => ({ id, name: `Device ${id}`, platform: 'macos', version: '1', host: '10.0.0.9', port: 7 } as any);

beforeEach(() => {
  jest.clearAllMocks();
  useSyncStore.getState().reset();
  useSyncStore.getState().setPairingCode('');
});

describe('SyncScreen', () => {
  it('starts the engine on mount and stops it on unmount', () => {
    const { unmount } = render(<SyncScreen />);
    expect(mockStart).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('renders this device + the empty discovered state', () => {
    useSyncStore.getState().setThisDevice({ id: 'me', name: 'My Phone', platform: 'ios', version: '1', host: '', port: 0 });
    useSyncStore.getState().setStatus('running');
    const { getByTestId } = render(<SyncScreen />);
    expect(getByTestId('sync-this-device').props.children).toBe('My Phone');
    expect(getByTestId('sync-no-devices')).toBeTruthy();
  });

  it('does NOT pair when no code is entered (button disabled)', () => {
    useSyncStore.getState().upsertDiscovered(disc('a'));
    const { getByTestId } = render(<SyncScreen />);
    fireEvent.press(getByTestId('sync-pair-a'));
    expect(mockPair).not.toHaveBeenCalled();
  });

  it('dials the tapped device with the entered pairing code', async () => {
    useSyncStore.getState().upsertDiscovered(disc('a'));
    const { getByTestId } = render(<SyncScreen />);
    fireEvent.changeText(getByTestId('sync-pairing-code'), 'blue-otter-42');
    fireEvent.press(getByTestId('sync-pair-a'));
    await waitFor(() => expect(mockPair).toHaveBeenCalledTimes(1));
    expect(mockPair.mock.calls[0][0].id).toBe('a');
    expect(mockPair.mock.calls[0][1]).toBe('blue-otter-42');
  });
});
