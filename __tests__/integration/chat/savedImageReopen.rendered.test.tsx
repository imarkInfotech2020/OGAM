import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ChatMessage } from '../../../src/components/ChatMessage';
import { useChatStore } from '../../../src/stores/chatStore';

const CURRENT_IMAGE_URI =
  'file:///mock/documents/generated-images/running-horse.png';
const STALE_IMAGE_URI =
  'file:///var/mobile/Containers/Data/Application/OLD-CONTAINER/Documents/generated-images/running-horse.png';

function ReopenedSavedImage() {
  const conversationId = useChatStore(state => state.activeConversationId);
  const message = useChatStore(state =>
    state.conversations
      .find(conversation => conversation.id === conversationId)
      ?.messages[0],
  );
  const [openedImage, setOpenedImage] = React.useState<string | null>(null);

  if (!message) return null;
  return (
    <>
      <ChatMessage
        message={message}
        showActions={false}
        animateEntry={false}
        onImagePress={setOpenedImage}
      />
      {openedImage === CURRENT_IMAGE_URI ? <Text>Image preview open</Text> : null}
    </>
  );
}

describe('saved iOS image after reopening chat', () => {
  beforeEach(() => {
    useChatStore.getState().clearAllConversations();
  });

  it('renders and opens an image whose stored container path is stale', async () => {
    const chat = useChatStore.getState();
    const conversationId = chat.createConversation('saved-image-model');
    chat.addMessage(conversationId, {
      role: 'assistant',
      content: 'Generated image for: a running horse',
      attachments: [
        {
          id: 'saved-image',
          type: 'image',
          uri: STALE_IMAGE_URI,
          width: 1024,
          height: 1024,
        },
      ],
    });

    const firstOpen = render(<ReopenedSavedImage />);
    fireEvent(firstOpen.getByTestId('generated-image-content'), 'load');
    expect(await firstOpen.findByLabelText('Generated image loaded')).toBeTruthy();
    firstOpen.unmount();

    chat.setActiveConversation(null);
    chat.setActiveConversation(conversationId);
    const reopened = render(<ReopenedSavedImage />);
    fireEvent(reopened.getByTestId('generated-image-content'), 'load');
    fireEvent.press(await reopened.findByLabelText('Generated image loaded'));
    expect(await reopened.findByText('Image preview open')).toBeTruthy();
  });
});
