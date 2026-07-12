/**
 * T056 / DEV-B13 — a generation that ends in ERROR must clear the loading state and show the error; it must
 * NOT leave the UI spinning forever.
 *
 * Device (B13, part2): a generation that ended reason=error (vision decode fail) left the UI spinning
 * indefinitely and the user saw no error — a dead-end with no way forward.
 *
 * User behavior, real gestures: litert model active, send a message; the native runtime errors (device-shaped
 * litert_error). Assert what the user SEES afterward: the input has returned to its idle send affordance (the
 * generating STOP control is gone) AND the error surfaced. RED (B13): the stop/spinner persists (isGenerating
 * never cleared).
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

describe('T056 (rendered) — generation error clears the spinner + surfaces the error (DEV-B13)', () => {
  it('returns the input to idle (stop control gone) and shows the error after a failed generation', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'android' });
    h.render();

    // Send; the native runtime fails the generation (reason=error).
    h.boundary.litert.scriptError('Failed to evaluate chunks');
    await h.tapSend('describe this image');

    // The send happened (user message on screen) and the error reached the user — proves the errored
    // generation path actually ran (so the STOP-control assertion below isn't trivially true).
    await h.rtl.waitFor(() => { expect(h.view!.queryAllByText('describe this image').length).toBeGreaterThan(0); }, { timeout: 4000 });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Failed to evaluate chunks/)).not.toBeNull(); }, { timeout: 4000 });
    await h.settle(300);

    // SPEC: the generation ended, so the generating STOP control is cleared — the input is usable again.
    // RED (B13): the stop/spinner persists forever (isGenerating never cleared on reason=error).
    expect(h.view!.queryByTestId('stop-button')).toBeNull();
  });
});
