import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

describe('chat mic after a native stop failure', () => {
  it.each([
    ['throws', 1],
    ['returns an error while active', 1],
    ['returns an error after stopping', 2],
  ] as const)(
    'handles a native stop that %s', async (stopFailure, expectedOpened) => {
    installNativeBoundary({ fs: true, whisper: true });
    const React = require('react');
    const rtl = requireRTL();
    const { AudioRecorder } = require('react-native-audio-api');
    const originalRecorder = AudioRecorder.getMockImplementation();
    const { ChatInput } = require('../../../src/components/ChatInput');
    const { audioRecorderService } = require('../../../src/services/audioRecorderService');
    const { remoteServerManager } = require('../../../src/services/remoteServerManager');
    let opened = 0;
    let stops = 0;
    let stopSucceeds = false;
    let view: ReturnType<typeof rtl.render> | undefined;
    try {
      // Only the native recorder is replaced. The chat input and recorder service are real.
      AudioRecorder.mockImplementation(() => {
        opened += 1;
        return {
          enableFileOutput: () => ({ status: 'success' }),
          start: () => ({ status: 'success' }),
          isRecording: () => stopFailure !== 'returns an error after stopping',
          stop: () => {
            stops += 1;
            if (!stopSucceeds && stopFailure === 'throws') throw new Error('Native recorder did not stop');
            if (!stopSucceeds) return { status: 'error' };
            return { status: 'success', path: '/recording.wav', duration: 1 };
          },
        };
      });
      const server = await remoteServerManager.addServer({
        name: 'Speech server', endpoint: 'http://192.168.1.50:7878',
        providerType: 'openai-compatible',
        mediaModels: { transcription: 'whisper-1' },
      });
      await remoteServerManager.setActiveRemoteMediaModel(server.id, 'transcription', 'whisper-1');
      view = rtl.render(React.createElement(ChatInput, { onSend: () => {} }));
      const event = {
        nativeEvent: { touches: [], changedTouches: [], identifier: 1, pageX: 0, pageY: 0, timestamp: 0 },
        touchHistory: { touchBank: [], numberActiveTouches: 0, indexOfSingleActiveTouch: -1, mostRecentTimeStamp: 0 },
      };

      rtl.fireEvent(view.getByTestId('voice-record-button'), 'responderGrant', event);
      await rtl.waitFor(() => expect(view!.getByTestId('voice-record-button').props.accessibilityLabel).toBe('Stop voice recording'));
      rtl.fireEvent(view.getByTestId('voice-record-button'), 'responderRelease', {
        ...event, nativeEvent: { ...event.nativeEvent, timestamp: 500 },
      });
      await rtl.waitFor(() => expect(stops).toBe(1));
      await rtl.waitFor(() => expect(view!.getByTestId('voice-record-button').props.accessibilityLabel).toBe('Start voice recording'));

      rtl.fireEvent(view.getByTestId('voice-record-button'), 'responderGrant', event);
      await rtl.waitFor(() => expect(stops + opened).toBe(3));
      expect(opened).toBe(expectedOpened);
    } finally {
      view?.unmount();
      stopSucceeds = true;
      audioRecorderService.cancelRecording();
      AudioRecorder.mockImplementation(originalRecorder);
      await remoteServerManager.clearAllServers();
    }
  });
});
