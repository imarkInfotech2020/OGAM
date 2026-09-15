/**
 * A saved voice note keeps its Documents file when the chat is closed and reopened. The reopened
 * message offers one action, sends that same file through the configured transcription boundary,
 * and persists the replacement transcript through the real chat mutation owner.
 */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import RNFS from 'react-native-fs';
import { initialAlertState, type AlertState } from '../../../src/components/CustomAlert';
import { handleTranscribeAgainFn } from '../../../src/screens/ChatScreen/useChatMessageHandlers';
import { useChatStore } from '../../../src/stores/chatStore';
import { useRemoteServerStore } from '../../../src/stores/remoteServerStore';
import { createAudioAttachment } from '../../utils/factories';
import { MessageAudioMode } from '../../../pro/audio/ui/MessageAudioMode';

const AUDIO_PATH = '/mock/documents/audio-input/input_saved.wav';
const STALE_AUDIO_PATH =
  '/var/mobile/Containers/Data/Application/OLD-CONTAINER/Documents/audio-input/input_saved.wav';

function ReopenedSavedVoiceMessage() {
  const conversationId = useChatStore(state => state.activeConversationId);
  const message = useChatStore(state =>
    state.conversations
      .find(conversation => conversation.id === conversationId)
      ?.messages[0],
  );
  const updateMessageTranscription = useChatStore(
    state => state.updateMessageTranscription,
  );
  const [alertState, setAlertState] = React.useState<AlertState>(initialAlertState);

  if (!message) return null;
  return (
    <>
      <MessageAudioMode
        msg={message}
        isStreamingThis={false}
        shouldAnimate={false}
        showGenerationDetails={false}
        onCopy={() => {}}
        onRetry={() => {}}
        onEdit={(targetMessage, newContent) => {
          const audioAttachment = targetMessage.attachments?.find(
            attachment => attachment.type === 'audio',
          );
          if (conversationId && audioAttachment) {
            useChatStore.getState().updateMessageTranscription(
              conversationId,
              targetMessage.id,
              audioAttachment.id,
              newContent,
            );
          }
        }}
        onGenerateImage={() => {}}
        onImagePress={() => {}}
        onTranscribeAgain={(targetMessage, attachment) =>
          handleTranscribeAgainFn({
            message: targetMessage,
            attachment,
            activeConversationId: conversationId,
            updateMessageTranscription,
            setAlertState,
          })
        }
      />
      {alertState.visible ? <Text>{alertState.message}</Text> : null}
    </>
  );
}

describe('saved voice message transcription after reopening chat', () => {
  beforeEach(() => {
    useChatStore.getState().clearAllConversations();
    useRemoteServerStore.getState().clearAllServers();
    (RNFS.exists as jest.Mock).mockImplementation(async path => path === AUDIO_PATH);
    global.fetch = async () =>
      new Response(JSON.stringify({ text: 'replacement transcript' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const remoteServers = useRemoteServerStore.getState();
    remoteServers.addServer(
      {
        name: 'Saved speech boundary',
        endpoint: 'http://192.168.1.20:7878',
        providerType: 'openai-compatible',
        mediaModels: { transcription: 'whisper' },
      },
      'saved-speech-boundary',
    );
    remoteServers.setActiveRemoteMediaServerId(
      'transcription',
      'saved-speech-boundary',
    );
  });

  it('keeps the action and replacement transcript across a chat reopen', async () => {
    const chat = useChatStore.getState();
    const conversationId = chat.createConversation('saved-voice-model');
    chat.addMessage(conversationId, {
      role: 'user',
      content: 'first transcript',
      attachments: [
        createAudioAttachment({
          id: 'saved-audio',
          uri: `file://${STALE_AUDIO_PATH}`,
          textContent: 'first transcript',
        }),
      ],
    });

    const firstOpen = render(<ReopenedSavedVoiceMessage />);
    fireEvent.press(firstOpen.getByText('•••'));
    expect(await firstOpen.findByTestId('action-transcribe-again')).toBeTruthy();
    firstOpen.unmount();

    chat.setActiveConversation(null);
    chat.setActiveConversation(conversationId);
    const reopened = render(<ReopenedSavedVoiceMessage />);
    await waitFor(() => expect(reopened.getByText('•••')).toBeTruthy());
    fireEvent.press(reopened.getByText('•••'));
    fireEvent.press(await reopened.findByTestId('action-transcribe-again'));
    fireEvent.press(reopened.getByText('Show transcript'));

    await waitFor(() =>
      expect(
        reopened.getByText('replacement transcript'),
      ).toBeTruthy(),
    );
    reopened.unmount();

    chat.setActiveConversation(null);
    chat.setActiveConversation(conversationId);
    const reopenedAgain = render(<ReopenedSavedVoiceMessage />);
    fireEvent.press(reopenedAgain.getByText('Show transcript'));
    expect(
      await reopenedAgain.findByText('replacement transcript'),
    ).toBeTruthy();
  });

  it('does not offer the action when the saved file is gone', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    const chat = useChatStore.getState();
    const conversationId = chat.createConversation('saved-voice-model');
    chat.addMessage(conversationId, {
      role: 'user',
      content: 'first transcript',
      attachments: [
        createAudioAttachment({
          id: 'missing-audio',
          uri: `file://${AUDIO_PATH}`,
          textContent: 'first transcript',
        }),
      ],
    });

    const reopened = render(<ReopenedSavedVoiceMessage />);
    await waitFor(() =>
      expect(reopened.queryByText('•••')).toBeTruthy(),
    );
    fireEvent.press(reopened.getByText('•••'));
    expect(reopened.queryByTestId('action-transcribe-again')).toBeNull();
  });

  it('edits a saved voice transcript and keeps it after reopening chat', async () => {
    const chat = useChatStore.getState();
    const conversationId = chat.createConversation('saved-voice-model');
    chat.addMessage(conversationId, {
      role: 'user',
      content: 'draw a hose',
      attachments: [
        createAudioAttachment({
          id: 'editable-audio',
          uri: `file://${STALE_AUDIO_PATH}`,
          textContent: 'draw a hose',
        }),
      ],
    });

    const firstOpen = render(<ReopenedSavedVoiceMessage />);
    fireEvent.press(firstOpen.getByText('•••'));
    fireEvent.press(await firstOpen.findByText('Edit'));
    const input = await firstOpen.findByPlaceholderText('Enter message...');
    fireEvent.changeText(input, 'draw a horse');
    fireEvent.press(firstOpen.getByText('SAVE & RESEND'));
    fireEvent.press(firstOpen.getByText('Show transcript'));
    expect(await firstOpen.findByText('draw a horse')).toBeTruthy();
    firstOpen.unmount();

    chat.setActiveConversation(null);
    chat.setActiveConversation(conversationId);
    const reopened = render(<ReopenedSavedVoiceMessage />);
    fireEvent.press(reopened.getByText('Show transcript'));
    expect(await reopened.findByText('draw a horse')).toBeTruthy();
  });
});
