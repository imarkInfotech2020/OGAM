/**
 * The add / edit server sheet, driven the way a user drives it.
 *
 * Replaces `__tests__/rntl/components/RemoteServerModal.test.tsx`, which mocked six of our own
 * modules - the sheet container, the manager, the STORE, the http client, the theme and the alert.
 * With the store mocked it could not observe the one thing that matters, which is whether a server
 * ends up in your list, so it asserted that a mock had been called instead.
 *
 * What is covered HERE is only what nothing else covers. The happy path (open, type, test, save,
 * see it Connected) already has a home in `remoteServerConnect.rendered.happy.test.tsx`, so this
 * takes the three behaviours that had no honest test:
 *   1. a refusal - a malformed address is rejected and adds nothing,
 *   2. the privacy warning - it appears for an address off your network and not for one on it,
 *   3. editing - a rename reaches the list.
 *
 * Everything runs for real, from the screen down through the form, the manager and the store.
 * Fakes sit at the device boundary only: this phone's address, and the network itself.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useIsFocused: () => true,
  useFocusEffect: () => {},
}));

import { RemoteServersScreen } from '../../../src/screens/RemoteServersScreen';
import { useRemoteServerStore } from '../../../src/stores';
import { installLanProbe, gatewayModelList, type LanProbeHandle } from '../../harness/lanProbe';

const MAC = '192.168.1.30:7878';
const PUBLIC_ENDPOINT = 'https://api.groq.com';

describe('adding a server by hand', () => {
  let lan: LanProbeHandle;

  beforeEach(() => {
    useRemoteServerStore.setState({ servers: [], serverHealth: {}, discoveredModels: {} });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const DeviceInfo = require('react-native-device-info');
    DeviceInfo.isEmulator = jest.fn(async () => false);
    DeviceInfo.getIpAddress = jest.fn(async () => '192.168.1.10');
    lan = installLanProbe({ [MAC]: { paths: ['/v1/'], body: gatewayModelList } });
  });

  afterEach(() => lan.uninstall());

  /** Open the sheet the way a user does: from the screen's own button. */
  const openSheet = () => {
    const ui = render(<RemoteServersScreen />);
    fireEvent.press(ui.getByTestId('add-server'));
    return ui;
  };

  it('refuses an address that is not a URL, and adds nothing', async () => {
    const ui = openSheet();

    fireEvent.changeText(ui.getByPlaceholderText('e.g., Off Grid AI Desktop'), 'My Mac');
    fireEvent.changeText(ui.getByPlaceholderText('http://192.168.1.50:7878'), 'not-a-url');

    // BEFORE: no complaint on screen yet.
    expect(ui.queryByText('Invalid URL format')).toBeNull();

    fireEvent.press(ui.getByTestId('test-connection'));

    await waitFor(() => { expect(ui.queryByText('Invalid URL format')).not.toBeNull(); });

    // The list is untouched: a rejected address must not leave a half-made server behind.
    expect(useRemoteServerStore.getState().servers).toHaveLength(0);
  });

  it('warns when the address is off your own network, and stops warning when it is on it', async () => {
    const ui = openSheet();
    const address = ui.getByPlaceholderText('http://192.168.1.50:7878');

    // An address on your own network says nothing: the data never leaves the house.
    fireEvent.changeText(address, `http://${MAC}`);
    expect(ui.queryByText(/leaves your network/)).toBeNull();

    // An address on the public internet warns, and says what actually happens to the data.
    fireEvent.changeText(address, PUBLIC_ENDPOINT);
    await waitFor(() => { expect(ui.queryByText(/leaves your network/)).not.toBeNull(); });

    // Back to a private address and the warning goes: it tracks the address, it does not latch.
    fireEvent.changeText(address, `http://${MAC}`);
    await waitFor(() => { expect(ui.queryByText(/leaves your network/)).toBeNull(); });
  });

  it('renames a server through Edit, and the list shows the new name', async () => {
    const ui = openSheet();

    // Arrive at "a server exists" the way a user does - add one - rather than writing the store.
    fireEvent.changeText(ui.getByPlaceholderText('e.g., Off Grid AI Desktop'), 'Old name');
    fireEvent.changeText(ui.getByPlaceholderText('http://192.168.1.50:7878'), `http://${MAC}`);
    fireEvent.press(ui.getByTestId('test-connection'));
    await waitFor(() => { expect(ui.getByTestId('save-server')).toBeTruthy(); });
    fireEvent.press(ui.getByTestId('save-server'));
    await waitFor(() => { expect(ui.queryByText('Old name')).not.toBeNull(); });

    // Now the real gesture under test: Edit the row, change the name, save.
    fireEvent.press(ui.getByText('Edit'));
    fireEvent.changeText(ui.getByPlaceholderText('e.g., Off Grid AI Desktop'), 'Mac in the study');
    fireEvent.press(ui.getByTestId('test-connection'));
    await waitFor(() => { expect(ui.getByTestId('save-server')).toBeTruthy(); });
    fireEvent.press(ui.getByTestId('save-server'));

    // The list shows the new name, and the old one is gone - a rename, not a second row.
    await waitFor(() => { expect(ui.queryByText('Mac in the study')).not.toBeNull(); });
    expect(ui.queryByText('Old name')).toBeNull();
    expect(useRemoteServerStore.getState().servers).toHaveLength(1);
  });
});
