/**
 * HAPPY-PATH (integration) — persistence across a relaunch: a conversation and a project created in one
 * "launch" survive an app relaunch and render.
 *
 * The stores use REAL zustand `persist` to AsyncStorage (stateful mock). A relaunch is modelled by
 * jest.resetModules() + re-requiring the stores, which triggers the REAL rehydration from persisted
 * storage. No mock of the persistence logic. Asserts the rehydrated store + the rendered Recent list.
 */
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('happy — data survives a relaunch (real persist)', () => {
  it('a conversation + project persist across a simulated relaunch and render', async () => {
    // --- Launch 1: create data (persisted to AsyncStorage via the real persist middleware) ---
    jest.resetModules();
    {
      /* eslint-disable @typescript-eslint/no-var-requires */
      const { useChatStore, useProjectStore } = require('../../../src/stores');
      /* eslint-enable @typescript-eslint/no-var-requires */
      useProjectStore.getState().createProject({ name: 'Persisted Project', description: '', systemPrompt: '' });
      useChatStore.getState().createConversation('m', 'Persisted Chat');
      // Let the persist middleware flush the write to AsyncStorage.
      await new Promise((r) => setTimeout(r, 0));
    }

    // --- Relaunch: fresh module graph → stores rehydrate from persisted storage ---
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const React = require('react');
    const { requireRTL } = require('../../harness/nativeBoundary');
    const { render, waitFor } = requireRTL();
    const { useChatStore, useProjectStore } = require('../../../src/stores');
    const { RecentConversations } = require('../../../src/screens/HomeScreen/components/RecentConversations');
    /* eslint-enable @typescript-eslint/no-var-requires */

    // Await real rehydration from AsyncStorage.
    await useChatStore.persist?.rehydrate?.();
    await useProjectStore.persist?.rehydrate?.();
    await waitFor(() => { expect(useChatStore.getState().conversations.length).toBeGreaterThan(0); });

    // The project survived.
    expect(useProjectStore.getState().projects.some((p: { name: string }) => p.name === 'Persisted Project')).toBe(true);

    // The conversation survived AND renders in the Recent list.
    const conversations = useChatStore.getState().conversations;
    const view = render(React.createElement(RecentConversations, { conversations, totalCount: conversations.length, focusTrigger: 0, onContinueChat: () => {}, onDeleteConversation: () => {}, onSeeAll: () => {} }));
    expect(view.getByText('Persisted Chat')).toBeTruthy();
  });
});
