/**
 * RED-FLOW (integration) — Q9: deleting a project orphans its chats with a dangling projectId.
 *
 * projectStore.deleteProject only filters the projects array — it never cascades to the conversations
 * that referenced it. So a chat keeps a projectId pointing at a project that no longer exists: it stops
 * appearing under any project view and isn't re-filable. Pure store + render (no native leaf): mount the
 * REAL ProjectChatsScreen over the REAL chatStore/projectStore.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { ProjectChatsScreen } from '../../../src/screens/ProjectChatsScreen';
import { useChatStore, useProjectStore } from '../../../src/stores';
import { createProject } from '../../utils/factories';

let routeProjectId = 'proj-1';
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
  useRoute: () => ({ params: { projectId: routeProjectId } }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

describe('Q9 — deleting a project orphans its chats (red-flow)', () => {
  it('does not leave a chat pointing at a deleted project', () => {
    useProjectStore.setState({ projects: [createProject({ id: 'proj-1', name: 'Research' })] });
    const convId = useChatStore.getState().createConversation('m', 'My filed chat', 'proj-1');

    // Precondition: the chat is visibly filed under the project.
    const view = render(<ProjectChatsScreen />);
    expect(view.getByText('My filed chat')).toBeTruthy();

    // User deletes the project.
    useProjectStore.getState().deleteProject('proj-1');

    // Correct: the chat is no longer bound to a project that doesn't exist (re-filable / unfiled).
    // Today deleteProject doesn't cascade, so its projectId still points at the deleted project → RED.
    const conv = useChatStore.getState().conversations.find(c => c.id === convId)!;
    const danglingRef = conv.projectId != null && useProjectStore.getState().getProject(conv.projectId) == null;
    expect(danglingRef).toBe(false);
  });
});
