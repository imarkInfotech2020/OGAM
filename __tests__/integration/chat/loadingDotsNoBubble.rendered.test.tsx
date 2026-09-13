import React from 'react';
import { render } from '@testing-library/react-native';
import { ChatMessage } from '../../../src/components/ChatMessage';
import { getDisplayMessages } from '../../../src/screens/ChatScreen/types';
import type { Message } from '../../../src/types';

it('shows bare loading dots, then an answer bubble when the reply arrives', () => {
  const question: Message = {
    id: 'question',
    role: 'user',
    content: 'Hi',
    timestamp: 1,
  };
  const waiting = getDisplayMessages([question], {
    isThinking: true,
    streamingMessage: '',
    streamingReasoningContent: '',
    isStreamingForThisConversation: true,
  })[1] as Message;

  const view = render(<ChatMessage message={waiting} isStreaming />);
  expect(view.getByTestId('thinking-indicator')).toBeTruthy();
  expect(view.getByLabelText('Working')).toBeTruthy();
  expect(view.queryByTestId('message-bubble')).toBeNull();
  expect(view.queryByTestId('message-meta-row')).toBeNull();

  view.rerender(
    <ChatMessage
      message={{ id: 'answer', role: 'assistant', content: 'Hello.', timestamp: 2 }}
    />,
  );
  expect(view.getByText('Hello.')).toBeTruthy();
  expect(view.getByTestId('message-bubble')).toBeTruthy();
  expect(view.getByTestId('message-meta-row')).toBeTruthy();
});
