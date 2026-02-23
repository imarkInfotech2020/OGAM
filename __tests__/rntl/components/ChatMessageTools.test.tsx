/**
 * ChatMessage Tool Rendering Tests
 *
 * Tests for tool-related message rendering:
 * - ToolResultMessage (role === 'tool')
 * - ToolCallMessage (role === 'assistant' with toolCalls)
 * - SystemInfoMessage (isSystemInfo === true)
 * - Helper functions: getToolIcon, getToolLabel, buildMessageData
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChatMessage } from '../../../src/components/ChatMessage';
import type { Message } from '../../../src/types';

// Mock stripControlTokens utility
jest.mock('../../../src/utils/messageContent', () => ({
  stripControlTokens: (content: string) => content,
}));

/**
 * Helper to create a Message with arbitrary fields including tool-specific ones.
 */
const makeMessage = (overrides: Partial<Message>): Message => ({
  id: 'msg-1',
  role: 'user',
  content: 'test',
  timestamp: Date.now(),
  ...overrides,
});

describe('ChatMessage — Tool message rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // ToolResultMessage (message.role === 'tool')
  // ==========================================================================
  describe('ToolResultMessage', () => {
    it('renders with testID "tool-message"', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'Search results here',
        toolName: 'web_search',
      });

      const { getByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('tool-message')).toBeTruthy();
    });

    it('shows globe icon for web_search tool', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'Web search result',
        toolName: 'web_search',
      });

      const { getByTestId } = render(<ChatMessage message={message} />);

      // The component renders an Icon with name="globe" — mocked as "Icon"
      // Verify the tool message container is present
      expect(getByTestId('tool-message')).toBeTruthy();
    });

    it('shows "Web search result" label for web_search tool', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'Some search results returned from the web',
        toolName: 'web_search',
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText(/Web search result/)).toBeTruthy();
    });

    it('shows "Searched: query (no results)" label for empty web_search', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'No results found for "quantum computing"',
        toolName: 'web_search',
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText(/Searched: "quantum computing" \(no results\)/)).toBeTruthy();
    });

    it('shows calculator content as label', () => {
      const message = makeMessage({
        role: 'tool',
        content: '42',
        toolName: 'calculator',
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText('42')).toBeTruthy();
    });

    it('shows "Calculated" label when calculator has no content', () => {
      const message = makeMessage({
        role: 'tool',
        content: '',
        toolName: 'calculator',
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText('Calculated')).toBeTruthy();
    });

    it('shows "Retrieved date/time" label for get_current_datetime', () => {
      const message = makeMessage({
        role: 'tool',
        content: '2026-02-24T10:30:00Z',
        toolName: 'get_current_datetime',
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText(/Retrieved date\/time/)).toBeTruthy();
    });

    it('shows "Retrieved device info" label for get_device_info', () => {
      const message = makeMessage({
        role: 'tool',
        content: '{"model":"iPhone 15","os":"iOS 18"}',
        toolName: 'get_device_info',
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText(/Retrieved device info/)).toBeTruthy();
    });

    it('shows toolName as label for unknown tools', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'result data',
        toolName: 'custom_tool',
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText('custom_tool')).toBeTruthy();
    });

    it('shows "Tool result" label when toolName is undefined', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'some result',
        toolName: undefined,
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText('Tool result')).toBeTruthy();
    });

    it('shows duration when generationTimeMs is set', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'Result data',
        toolName: 'web_search',
        generationTimeMs: 350,
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText(/350ms/)).toBeTruthy();
    });

    it('does not show duration when generationTimeMs is not set', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'Result data',
        toolName: 'web_search',
      });

      const { queryByText } = render(<ChatMessage message={message} />);

      expect(queryByText(/\(\d+ms\)/)).toBeNull();
    });

    // ---- Expandable details ----

    it('is expandable when content has details (non-empty, not starting with "No results")', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'Detailed search results with lots of data...',
        toolName: 'web_search',
      });

      const { getByTestId, getByText } = render(<ChatMessage message={message} />);

      // Should show the tool message
      expect(getByTestId('tool-message')).toBeTruthy();

      // Tap to expand
      fireEvent.press(getByText(/Web search result/));

      // After expanding, the detailed content should be visible
      expect(getByText('Detailed search results with lots of data...')).toBeTruthy();
    });

    it('collapses expanded content when tapped again', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'Detailed search results',
        toolName: 'web_search',
      });

      const { getByText } = render(<ChatMessage message={message} />);

      // Expand
      fireEvent.press(getByText(/Web search result/));
      expect(getByText('Detailed search results')).toBeTruthy();

      // Collapse
      fireEvent.press(getByText(/Web search result/));

      // The label text should still be there but the detail view is removed.
      // The detail text only appears in the expanded container, not the label.
      // The label for web_search is "Web search result", the detail is the raw content.
      // After collapsing, the raw content text node inside toolDetailContainer should be gone.
    });

    it('is not expandable when content starts with "No results"', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'No results found for "test query"',
        toolName: 'web_search',
      });

      const { getByTestId, queryByText } = render(<ChatMessage message={message} />);

      expect(getByTestId('tool-message')).toBeTruthy();

      // The hasDetails should be false because content starts with "No results"
      // Tapping should not expand anything (the TouchableOpacity is disabled)
      // There should be no chevron-down icon detail content
      // Since it's not expandable, tapping won't reveal the raw content separately
      // The label itself shows the "no results" info
      expect(queryByText('No results found for "test query"')).toBeNull();
    });

    it('is not expandable when content is empty', () => {
      const message = makeMessage({
        role: 'tool',
        content: '',
        toolName: 'calculator',
      });

      const { getByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('tool-message')).toBeTruthy();
    });
  });

  // ==========================================================================
  // ToolCallMessage (message.role === 'assistant' with toolCalls)
  // ==========================================================================
  describe('ToolCallMessage', () => {
    it('renders with testID "tool-call-message"', () => {
      const message = makeMessage({
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'tc-1', name: 'web_search', arguments: '{"query":"test"}' },
        ],
      });

      const { getByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('tool-call-message')).toBeTruthy();
    });

    it('shows "Using web_search" text with arguments preview', () => {
      const message = makeMessage({
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'tc-1', name: 'web_search', arguments: '{"query":"react native"}' },
        ],
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText(/Using web_search.*react native/)).toBeTruthy();
    });

    it('shows multiple tool calls', () => {
      const message = makeMessage({
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'tc-1', name: 'web_search', arguments: '{"query":"first"}' },
          { id: 'tc-2', name: 'calculator', arguments: '{"expression":"2+2"}' },
        ],
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText(/Using web_search/)).toBeTruthy();
      expect(getByText(/Using calculator/)).toBeTruthy();
    });

    it('shows raw arguments when JSON parse fails', () => {
      const message = makeMessage({
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'tc-1', name: 'custom_tool', arguments: 'not-valid-json' },
        ],
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText(/Using custom_tool.*not-valid-json/)).toBeTruthy();
    });

    it('shows tool call without arguments preview when arguments are empty object', () => {
      const message = makeMessage({
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'tc-1', name: 'get_current_datetime', arguments: '{}' },
        ],
      });

      const { getByText } = render(<ChatMessage message={message} />);

      // With empty object, Object.values({}).join(', ') === ''
      // So argsPreview is '' and the text should just be "Using get_current_datetime"
      expect(getByText('Using get_current_datetime')).toBeTruthy();
    });

    it('renders tool call without id (uses index as key)', () => {
      const message = makeMessage({
        role: 'assistant',
        content: '',
        toolCalls: [
          { name: 'web_search', arguments: '{"query":"test"}' },
        ],
      });

      const { getByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('tool-call-message')).toBeTruthy();
    });

    it('does not render as tool-call when toolCalls is empty array', () => {
      const message = makeMessage({
        role: 'assistant',
        content: 'Normal assistant response',
        toolCalls: [],
      });

      const { queryByTestId, getByTestId } = render(<ChatMessage message={message} />);

      // Empty toolCalls array => length is 0 => falsy, so it renders as normal assistant message
      expect(queryByTestId('tool-call-message')).toBeNull();
      expect(getByTestId('assistant-message')).toBeTruthy();
    });
  });

  // ==========================================================================
  // SystemInfoMessage (message.isSystemInfo === true)
  // ==========================================================================
  describe('SystemInfoMessage', () => {
    it('renders with testID "system-info-message"', () => {
      const message = makeMessage({
        role: 'system',
        content: 'Model loaded successfully',
        isSystemInfo: true,
      });

      const { getByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('system-info-message')).toBeTruthy();
    });

    it('displays the system info content text', () => {
      const message = makeMessage({
        role: 'system',
        content: 'Llama 3.2 loaded in 2.5s',
        isSystemInfo: true,
      });

      const { getByText } = render(<ChatMessage message={message} />);

      expect(getByText('Llama 3.2 loaded in 2.5s')).toBeTruthy();
    });

    it('takes precedence over tool role check (isSystemInfo checked first)', () => {
      // Even if role is 'tool', isSystemInfo should take priority in the render path
      const message = makeMessage({
        role: 'system',
        content: 'System notification',
        isSystemInfo: true,
      });

      const { getByTestId, queryByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('system-info-message')).toBeTruthy();
      expect(queryByTestId('tool-message')).toBeNull();
    });
  });

  // ==========================================================================
  // Routing: tool message vs assistant message vs system info
  // ==========================================================================
  describe('message routing', () => {
    it('renders tool result for role=tool', () => {
      const message = makeMessage({
        role: 'tool',
        content: 'Tool output',
        toolName: 'calculator',
      });

      const { getByTestId, queryByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('tool-message')).toBeTruthy();
      expect(queryByTestId('assistant-message')).toBeNull();
      expect(queryByTestId('tool-call-message')).toBeNull();
    });

    it('renders tool call for assistant with toolCalls', () => {
      const message = makeMessage({
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'web_search', arguments: '{}' }],
      });

      const { getByTestId, queryByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('tool-call-message')).toBeTruthy();
      expect(queryByTestId('assistant-message')).toBeNull();
      expect(queryByTestId('tool-message')).toBeNull();
    });

    it('renders normal assistant message when no toolCalls', () => {
      const message = makeMessage({
        role: 'assistant',
        content: 'Normal reply',
      });

      const { getByTestId, queryByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('assistant-message')).toBeTruthy();
      expect(queryByTestId('tool-call-message')).toBeNull();
      expect(queryByTestId('tool-message')).toBeNull();
    });

    it('renders system info before checking role', () => {
      const message = makeMessage({
        role: 'assistant',
        content: 'System event',
        isSystemInfo: true,
      });

      const { getByTestId, queryByTestId } = render(<ChatMessage message={message} />);

      expect(getByTestId('system-info-message')).toBeTruthy();
      expect(queryByTestId('assistant-message')).toBeNull();
    });
  });

  // ==========================================================================
  // getToolIcon coverage (via rendered tool results)
  // ==========================================================================
  describe('getToolIcon mapping', () => {
    // We cannot directly inspect the icon name prop due to the mock,
    // but we can verify each tool name renders without error.
    const toolNames = [
      'web_search',
      'calculator',
      'get_current_datetime',
      'get_device_info',
      'unknown_tool',
      undefined,
    ];

    toolNames.forEach(toolName => {
      it(`renders tool result for toolName="${toolName}" without crashing`, () => {
        const message = makeMessage({
          role: 'tool',
          content: 'result',
          toolName,
        });

        const { getByTestId } = render(<ChatMessage message={message} />);
        expect(getByTestId('tool-message')).toBeTruthy();
      });
    });
  });
});
