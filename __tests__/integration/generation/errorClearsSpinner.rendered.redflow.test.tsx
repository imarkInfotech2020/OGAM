/**
 * T056 / DEV-B13 — a LLAMA (GGUF) generation that fails must show the user an error AND clear the loading
 * state. On device it does NEITHER: the vision decode fails, no error is shown, and the spinner spins forever.
 *
 * Device (part2/part7 wire capture): a vision send on a bigger GGUF model →
 *   [LLM-NATIVE] error: llama_decode: failed to decode, ret = -1
 *   [GenerationService] Generation error: Failed to evaluate chunks
 *   [ChatGen] Generation failed: Failed to evaluate chunks   →   [GEN-SM] session end reason=error
 * ...yet the UI showed no error and kept spinning. User (this session): "the vision thing failed and I
 * didn't get a fucking error."
 *
 * IMPORTANT: this is the LLAMA path. The litert error path DOES clear + surface the error (verified) — the
 * bug is specific to the llama engine's failure handling, so this test pins engine:'llama'.
 *
 * User behavior, real gestures: llama model active, send; the native runtime fails the completion (device-
 * shaped "Failed to evaluate chunks"). SPEC: the user sees an error and the input returns to idle.
 * RED on HEAD (B13): no error is shown and the generating STOP control stays (spinner never clears).
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

describe('T056 (rendered) — a failed LLAMA generation shows an error + clears the spinner (DEV-B13)', () => {
  it('surfaces the error and returns the input to idle after a llama generation fails', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android' });
    h.render();

    // The native llama runtime fails the completion (device-shaped vision-decode failure).
    h.boundary.llama!.scriptCompletion({ throwMessage: 'Failed to evaluate chunks' });
    await h.tapSend('describe this image');

    // The send happened (proves the errored generation actually ran, not a no-op).
    await h.rtl.waitFor(() => { expect(h.view!.queryAllByText('describe this image').length).toBeGreaterThan(0); }, { timeout: 4000 });
    await h.settle(400);

    // SPEC: the user is told the generation failed. RED (B13): no error is shown at all.
    expect(h.view!.queryByText(/Failed to evaluate chunks|Generation Error/i)).not.toBeNull();
    // SPEC: the loading state cleared — input usable again. RED (B13): the STOP control spins forever.
    expect(h.view!.queryByTestId('stop-button')).toBeNull();
  });
});
