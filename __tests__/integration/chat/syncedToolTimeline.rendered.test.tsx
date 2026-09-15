import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ChatMessage } from '../../../src/components/ChatMessage';
import { getDisplayMessages } from '../../../src/screens/ChatScreen/types';
import { useChatStore } from '../../../src/stores/chatStore';
import { MobileStateMaterializer } from '../../../pro/sync/mobileStateMaterializer';
import { createGenerationMeta, createMessage } from '../../utils/factories';

describe('synced assistant tool timeline', () => {
  it('shows peer thinking, enhanced prompt, image tool, and answer without a new sync field', () => {
    const materializer = new MobileStateMaterializer();
    useChatStore.getState().clearAllConversations();
    materializer.put('conversation', 'synced-image-chat', {
      title: 'Synced image chat',
      created_at: '2026-09-15T02:00:00.000Z',
      updated_at: '2026-09-15T02:00:01.000Z',
      project_id: null,
    });
    materializer.put('message', 'synced-image-answer', {
      conversation_id: 'synced-image-chat',
      role: 'assistant',
      content:
        '<think>__LABEL:Enhanced prompt__\nA cinematic horse at sunset.</think>\n\nGenerated for: a horse',
      context: JSON.stringify({
        reasoning: 'Plan the image request, then verify the result.',
        toolCalls: [
          {
            name: 'generate_image',
            result: 'Created the requested image.',
            status: 'completed',
          },
        ],
      }),
      created_at: '2026-09-15T02:00:01.000Z',
    });
    const messages = useChatStore
      .getState()
      .getConversationMessages('synced-image-chat');
    const display = getDisplayMessages(messages, {
      isThinking: false,
      streamingMessage: '',
      streamingReasoningContent: '',
      isStreamingForThisConversation: false,
    });
    const view = render(
      <View>
        {display.map(item => (
          <ChatMessage key={item.id} message={item} />
        ))}
      </View>,
    );

    expect(view.getAllByText('Thought process')).toHaveLength(1);
    expect(view.getAllByText('Enhanced prompt')).toHaveLength(1);
    expect(view.getAllByText('Generated image')).toHaveLength(1);
    expect(view.getByText('Generated for: a horse')).toBeTruthy();
  });

  it('shows thought, tools, answer, time, and details in that order and opens each disclosure', () => {
    const message = createMessage({
      id: 'synced-tool-reply',
      role: 'assistant',
      content: 'The answer is ready.',
      reasoningContent: 'I checked the sources.',
      toolArtifacts: [
        { name: 'web_search', result: 'First source.' },
        { name: 'web_search', result: 'Second source.' },
      ],
      generationMeta: {
        ...createGenerationMeta(),
        routedToolNames: ['web_search'],
      },
    });
    const view = render(
      <ChatMessage message={message} showGenerationDetails />,
    );
    const row = view.getByTestId('assistant-message');
    const visibleOrder = row
      .findAll(node =>
        [
          'thinking-block',
          'tool-message',
          'message-bubble',
          'message-meta-row',
          'tools-sent-collapsible',
          'generation-details-toggle',
        ].includes(node.props.testID),
      )
      .map(node => node.props.testID);

    const firstPosition = (testID: string): number =>
      visibleOrder.indexOf(testID);
    expect(
      [
        'thinking-block',
        'tool-message',
        'message-bubble',
        'message-meta-row',
        'tools-sent-collapsible',
        'generation-details-toggle',
      ].map(firstPosition),
    ).toEqual(
      [
        ...[
          'thinking-block',
          'tool-message',
          'message-bubble',
          'message-meta-row',
          'tools-sent-collapsible',
          'generation-details-toggle',
        ].map(firstPosition),
      ].sort((a, b) => a - b),
    );
    expect(view.getAllByText('Web search result')).toHaveLength(2);
    expect(view.getByText('The answer is ready.')).toBeTruthy();

    fireEvent.press(view.getAllByText('Web search result')[0]);
    expect(view.getByText('First source.')).toBeTruthy();
    fireEvent.press(view.getByText('Tools sent in request (1)'));
    expect(view.getByText('• web_search')).toBeTruthy();
    fireEvent.press(view.getByText('Generation details'));
    expect(view.getByTestId('generation-meta')).toBeTruthy();
  });
});
