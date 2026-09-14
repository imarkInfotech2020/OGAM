import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

describe('remote dictation in the chat composer', () => {
  it('records and transcribes through the selected remote server without local Whisper', async () => {
    installNativeBoundary({ fs: true, whisper: true });
    const React = require('react');
    const rtl = requireRTL();
    const { ChatInput } = require('../../../src/components/ChatInput');
    const { remoteServerManager } = require('../../../src/services/remoteServerManager');
    const originalFetch = global.fetch;
    const requests: string[] = [];
    let view: ReturnType<typeof rtl.render> | undefined;
    try {
      const server = await remoteServerManager.addServer({
        name: 'Desk',
        endpoint: 'http://192.168.1.50:7878',
        providerType: 'openai-compatible',
        mediaModels: { transcription: 'whisper-1' },
      });
      await remoteServerManager.setActiveRemoteMediaModel(server.id, 'transcription', 'whisper-1');
      global.fetch = (async (input, init) => {
        requests.push(String(input));
        expect(init?.method).toBe('POST');
        return { ok: true, json: async () => ({ text: 'Set a timer for ten minutes' }) } as Response;
      }) as typeof fetch;

      view = rtl.render(React.createElement(ChatInput, { onSend: jest.fn() }));
      const mic = await rtl.waitFor(() => view!.getByTestId('voice-record-button'));
      const event = {
        nativeEvent: { touches: [], changedTouches: [], identifier: 1, pageX: 0, pageY: 0, timestamp: 0 },
        touchHistory: { touchBank: [], numberActiveTouches: 0, indexOfSingleActiveTouch: -1, mostRecentTimeStamp: 0 },
      };
      rtl.fireEvent(mic, 'responderGrant', event);
      await rtl.waitFor(() => expect(view!.getByTestId('voice-record-button')).toBeTruthy());
      rtl.fireEvent(view.getByTestId('voice-record-button'), 'responderRelease', {
        ...event, nativeEvent: { ...event.nativeEvent, timestamp: 500 },
      });

      await rtl.waitFor(() => expect(view!.getByTestId('chat-input').props.value).toContain('Set a timer for ten minutes'), { timeout: 5000 });
      expect(requests).toEqual(['http://192.168.1.50:7878/v1/audio/transcriptions']);
    } finally {
      view?.unmount();
      global.fetch = originalFetch;
      await remoteServerManager.clearAllServers();
    }
  });
});
