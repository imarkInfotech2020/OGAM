import { waitFor, type RenderAPI } from '@testing-library/react-native';
import type { DeviceInfo } from '@offgrid/sync';

/**
 * Pair a fake peer with this phone the way a real one does.
 *
 * There is no "accept" step any more: the peer presents THIS device's pairing code, and a code that
 * matches pairs. So the code is read off the screen the user is looking at rather than hardcoded -
 * which is also what keeps this honest, because a test that invents the code proves nothing about the
 * code the app actually issued.
 */
export async function pairingCodeOnScreen(ui: RenderAPI): Promise<string> {
  const code = await waitFor(() => {
    const rendered = ui.getByTestId('sync-pairing-code-value').props
      .children as string;
    if (!rendered || rendered === 'Loading...') {
      throw new Error('the pairing code has not been issued yet');
    }
    return rendered;
  });
  // Displayed grouped for reading (ABCD-EFGH); the wire wants what the user would type.
  return code.trim();
}

export async function pairPeerWithPhone(input: {
  ui: RenderAPI;
  /** The peer's engine, which dials this phone exactly as a real device would. */
  peer: { pair: (device: DeviceInfo, code: string) => Promise<unknown> };
  phone: DeviceInfo;
  port: number;
}): Promise<void> {
  const code = await pairingCodeOnScreen(input.ui);
  await input.peer.pair(
    { ...input.phone, host: '127.0.0.1', port: input.port },
    code,
  );
}
