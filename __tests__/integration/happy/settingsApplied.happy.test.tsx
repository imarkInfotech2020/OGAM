/**
 * HAPPY-PATH (integration, HEAVY entry point) — text generation settings are actually applied: the sampler
 * values the user sets (temperature / topP / topK) reach the engine at the native boundary.
 *
 * Real ChatScreen + real generation pipeline + real liteRTService; native LiteRT faked (records the
 * resetConversation args). Asserts the user's sampler settings are what the engine was configured with — not
 * ignored. Complement to the image-settings coverage (imageBackends: steps/openCL; Q1/Q7 reds: size/cfg).
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('happy — text sampler settings reach the engine (heavy entry point)', () => {
  it('applies the user temperature + topP to the native resetConversation', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    // temperature + topP are the user-configurable LiteRT sampler settings (topK is fixed at 40).
    h.useAppStore.getState().updateSettings({ liteRTTemperature: 0.33, liteRTTopP: 0.55 });
    h.render();

    await h.send('hello', { content: 'Hi.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Hi\./)).not.toBeNull(); });

    // resetConversation(systemPrompt, temperature, topK, topP, toolsJson, historyJson)
    const calls = h.boundary.litert.calls.resetConversation;
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1];
    expect(last[1]).toBe(0.33); // temperature — from the user setting
    expect(last[3]).toBe(0.55); // topP — from the user setting
  });
});
