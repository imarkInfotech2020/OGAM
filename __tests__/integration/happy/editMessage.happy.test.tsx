/**
 * HAPPY-PATH (UI, BEHAVIORAL) — editing a message the way a user does: long-press the user bubble, tap
 * Edit, change the text, tap "SAVE & RESEND"; the edited message re-runs generation and the new answer
 * renders.
 *
 * Real ChatScreen + real action menu + real edit handler + real generation; only native LiteRT faked. Entry
 * is a genuine gesture chain (long-press → Edit → type → save), not a direct updateMessageContent call.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('happy — edit a message via the real action menu (heavy entry point)', () => {
  it('long-press → Edit → change text → SAVE & RESEND re-runs generation with the edit', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.render();

    await h.send('what is the capital of span', { content: 'The capital of Spain is Madrid.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/The capital of Spain is Madrid\./)).not.toBeNull(); });

    // User fixes the typo and resends via the real Edit gesture.
    await h.editLastUserMessage('what is the capital of Spain', { content: 'Madrid is the capital of Spain.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Madrid is the capital of Spain\./)).not.toBeNull(); });
  });
});
