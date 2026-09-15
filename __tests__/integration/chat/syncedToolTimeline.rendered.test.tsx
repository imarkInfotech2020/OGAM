import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ChatMessage } from '../../../src/components/ChatMessage';
import { getDisplayMessages } from '../../../src/screens/ChatScreen/types';
import { useChatStore } from '../../../src/stores/chatStore';
import { MobileStateMaterializer } from '../../../pro/sync/mobileStateMaterializer';
import { MessageAudioMode } from '../../../pro/audio/ui/MessageAudioMode';
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
    materializer.put('message', 'synced-image-thinking-before', {
      conversation_id: 'synced-image-chat',
      role: 'assistant',
      content: '<think>Plan the image request.</think>',
      context: null,
      created_at: '2026-09-15T02:00:00.100Z',
    });
    materializer.put('message', 'synced-image-tool', {
      conversation_id: 'synced-image-chat',
      role: 'tool',
      content: 'Created the requested image.',
      context: JSON.stringify({
        tool: { name: 'generate_image', status: 'completed' },
      }),
      created_at: '2026-09-15T02:00:00.200Z',
    });
    materializer.put('message', 'synced-image-thinking-after', {
      conversation_id: 'synced-image-chat',
      role: 'assistant',
      content: '<think>Verify the generated result.</think>',
      context: null,
      created_at: '2026-09-15T02:00:00.300Z',
    });
    materializer.put('message', 'synced-image-prompt', {
      conversation_id: 'synced-image-chat',
      role: 'assistant',
      content:
        '<think>__LABEL:Enhanced prompt__\nA cinematic horse at sunset.</think>',
      context: null,
      created_at: '2026-09-15T02:00:00.400Z',
    });
    materializer.put('message', 'synced-image-answer', {
      conversation_id: 'synced-image-chat',
      role: 'assistant',
      content: 'Generated image for: a horse',
      context: JSON.stringify({
        toolsOffered: ['generate_image'],
        metrics: { modelName: 'Qwen3 8B', totalSeconds: 2.6 },
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
          <ChatMessage
            key={item.id}
            message={item}
            supportingContext={
              'supportingContext' in item ? item.supportingContext : undefined
            }
          />
        ))}
      </View>,
    );

    expect(view.getAllByText('Thought process')).toHaveLength(2);
    expect(view.getAllByText('Enhanced prompt')).toHaveLength(1);
    expect(view.getAllByText('Generated image')).toHaveLength(1);
    expect(view.getByText('Generated image for: a horse')).toBeTruthy();

    view.unmount();
    const voiceView = render(
      <View>
        {display.map(item => (
          <MessageAudioMode
            key={item.id}
            msg={item}
            supportingContext={
              'supportingContext' in item ? item.supportingContext : undefined
            }
            isStreamingThis={false}
            shouldAnimate={false}
            showGenerationDetails
            onCopy={() => {}}
            onRetry={() => {}}
            onEdit={() => {}}
            onGenerateImage={() => {}}
            onImagePress={() => {}}
          />
        ))}
      </View>,
    );

    expect(voiceView.getAllByText('Thought process')).toHaveLength(2);
    expect(voiceView.getAllByText('Enhanced prompt')).toHaveLength(1);
    expect(voiceView.getAllByText('Generated image')).toHaveLength(1);
    expect(voiceView.getAllByTestId('message-meta-row')).toHaveLength(1);
    expect(voiceView.getAllByTestId('tools-sent-collapsible')).toHaveLength(1);
    expect(voiceView.getAllByTestId('generation-details-toggle')).toHaveLength(
      1,
    );

    const renderedOrder = voiceView.root
      .findAll(node =>
        [
          'tool-message',
          'audio-bubble-synced-image-answer',
          'message-meta-row',
          'tools-sent-collapsible',
          'generation-details-toggle',
        ].includes(node.props.testID),
      )
      .map(node => node.props.testID)
      .filter((testID, index, all) => index === 0 || testID !== all[index - 1]);
    expect(renderedOrder).toEqual([
      'tool-message',
      'audio-bubble-synced-image-answer',
      'message-meta-row',
      'tools-sent-collapsible',
      'generation-details-toggle',
    ]);
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
