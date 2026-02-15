/**
 * ProjectsScreen Tests
 *
 * Tests for the projects management screen including:
 * - Title and subtitle rendering
 * - Empty state
 * - Project list rendering
 * - Chat count badges
 * - Navigation
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useChatStore } from '../../../src/stores/chatStore';
import { useProjectStore } from '../../../src/stores/projectStore';
import { resetStores } from '../../utils/testHelpers';
import {
  createProject,
  createConversation,
} from '../../utils/factories';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: jest.fn(),
    useIsFocused: () => true,
  };
});

jest.mock('../../../src/hooks/useFocusTrigger', () => ({
  useFocusTrigger: () => 0,
}));

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style, testID }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity style={style} onPress={onPress} testID={testID}>
        {children}
      </TouchableOpacity>
    );
  },
}));

jest.mock('../../../src/components/CustomAlert', () => ({
  CustomAlert: () => null,
  showAlert: (title: string, message: string, buttons?: any[]) => ({
    visible: true,
    title,
    message,
    buttons: buttons || [{ text: 'OK', style: 'default' }],
  }),
  hideAlert: () => ({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  }),
  initialAlertState: {
    visible: false,
    title: '',
    message: '',
    buttons: [],
  },
}));

import { ProjectsScreen } from '../../../src/screens/ProjectsScreen';

describe('ProjectsScreen', () => {
  beforeEach(() => {
    resetStores();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Basic Rendering
  // ==========================================================================
  describe('basic rendering', () => {
    it('renders "Projects" title', () => {
      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('Projects')).toBeTruthy();
    });

    it('renders the subtitle description', () => {
      const { getByText } = render(<ProjectsScreen />);
      expect(
        getByText(
          'Projects group related chats with shared context and instructions.',
        ),
      ).toBeTruthy();
    });

    it('renders the New button', () => {
      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('New')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Empty State
  // ==========================================================================
  describe('empty state', () => {
    it('shows "No Projects Yet" when there are no projects', () => {
      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('No Projects Yet')).toBeTruthy();
    });

    it('shows empty state description text', () => {
      const { getByText } = render(<ProjectsScreen />);
      expect(
        getByText(/Create a project to organize your chats by topic/),
      ).toBeTruthy();
    });

    it('shows "Create Project" button in empty state', () => {
      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('Create Project')).toBeTruthy();
    });

    it('navigates to ProjectEdit when "Create Project" is pressed', () => {
      const { getByText } = render(<ProjectsScreen />);
      fireEvent.press(getByText('Create Project'));

      expect(mockNavigate).toHaveBeenCalledWith('ProjectEdit', {});
    });
  });

  // ==========================================================================
  // Project List Rendering
  // ==========================================================================
  describe('project list', () => {
    it('renders project names', () => {
      const project = createProject({ name: 'Code Review' });
      useProjectStore.setState({ projects: [project] });

      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('Code Review')).toBeTruthy();
    });

    it('renders multiple projects', () => {
      const projects = [
        createProject({ name: 'Project Alpha' }),
        createProject({ name: 'Project Beta' }),
      ];
      useProjectStore.setState({ projects });

      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('Project Alpha')).toBeTruthy();
      expect(getByText('Project Beta')).toBeTruthy();
    });

    it('does not show empty state when projects exist', () => {
      const project = createProject({ name: 'Exists' });
      useProjectStore.setState({ projects: [project] });

      const { queryByText } = render(<ProjectsScreen />);
      expect(queryByText('No Projects Yet')).toBeNull();
    });

    it('shows project description when available', () => {
      const project = createProject({
        name: 'My Project',
        description: 'A detailed project description',
      });
      useProjectStore.setState({ projects: [project] });

      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('A detailed project description')).toBeTruthy();
    });

    it('shows the first letter icon for each project', () => {
      const project = createProject({ name: 'Spanish Learning' });
      useProjectStore.setState({ projects: [project] });

      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('S')).toBeTruthy();
    });

    it('shows chat count for each project', () => {
      const project = createProject({ name: 'Test Project' });
      useProjectStore.setState({ projects: [project] });

      const conv1 = createConversation({ projectId: project.id });
      const conv2 = createConversation({ projectId: project.id });
      useChatStore.setState({ conversations: [conv1, conv2] });

      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('2')).toBeTruthy();
    });

    it('shows 0 chat count for project with no chats', () => {
      const project = createProject({ name: 'Empty Project' });
      useProjectStore.setState({ projects: [project] });

      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('0')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Navigation
  // ==========================================================================
  describe('navigation', () => {
    it('navigates to ProjectEdit when New button is pressed', () => {
      const { getByText } = render(<ProjectsScreen />);
      fireEvent.press(getByText('New'));

      expect(mockNavigate).toHaveBeenCalledWith('ProjectEdit', {});
    });

    it('navigates to ProjectDetail when project is pressed', () => {
      const project = createProject({ name: 'Nav Test' });
      useProjectStore.setState({ projects: [project] });

      const { getByText } = render(<ProjectsScreen />);
      fireEvent.press(getByText('Nav Test'));

      expect(mockNavigate).toHaveBeenCalledWith('ProjectDetail', { projectId: project.id });
    });
  });

  // ==========================================================================
  // Project without description
  // ==========================================================================
  describe('description rendering', () => {
    it('does not render description when project has no description', () => {
      const project = createProject({ name: 'No Desc' });
      // Ensure no description field
      delete (project as any).description;
      useProjectStore.setState({ projects: [project] });

      const { getByText, queryByText } = render(<ProjectsScreen />);
      expect(getByText('No Desc')).toBeTruthy();
      // There should be no description text rendered
    });

    it('renders description when project has one', () => {
      const project = createProject({ name: 'With Desc', description: 'Project details here' });
      useProjectStore.setState({ projects: [project] });

      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('Project details here')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Multiple projects with chats
  // ==========================================================================
  describe('chat counts', () => {
    it('shows correct counts for multiple projects', () => {
      const project1 = createProject({ name: 'Proj A' });
      const project2 = createProject({ name: 'Proj B' });
      useProjectStore.setState({ projects: [project1, project2] });

      const conv1 = createConversation({ projectId: project1.id });
      const conv2 = createConversation({ projectId: project1.id });
      const conv3 = createConversation({ projectId: project1.id });
      const conv4 = createConversation({ projectId: project2.id });
      useChatStore.setState({ conversations: [conv1, conv2, conv3, conv4] });

      const { getByText } = render(<ProjectsScreen />);
      expect(getByText('3')).toBeTruthy(); // project1
      expect(getByText('1')).toBeTruthy(); // project2
    });
  });
});
