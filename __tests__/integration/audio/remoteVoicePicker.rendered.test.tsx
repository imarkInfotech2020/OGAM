import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { VoicePickerPopover } from '../../../pro/audio/ui/VoicePickerPopover';
import { TTSButton } from '../../../pro/audio/ui/TTSButton';
import { remoteServerManager } from '../../../src/services/remoteServerManager';

describe('remote voice in the rendered chat controls', () => {
  const originalFetch = global.fetch;

  afterEach(async () => {
    global.fetch = originalFetch;
    await remoteServerManager.clearAllServers();
  });

  it('shows the selected server voices and saves the voice chosen in the picker', async () => {
    const server = await remoteServerManager.addServer({
      name: 'Desk',
      endpoint: 'http://192.168.1.50:7878',
      providerType: 'openai-compatible',
      mediaModels: { voice: 'kokoro' },
    });
    await remoteServerManager.setActiveRemoteMediaModel(server.id, 'voice', 'kokoro');
    global.fetch = (async (_input, init) => {
      if (init?.method !== 'GET') throw new Error('Unexpected request');
      return { ok: true, json: async () => ({ voices: ['af_heart', 'am_puck'] }) } as Response;
    }) as typeof fetch;

    const view = render(<VoicePickerPopover visible onClose={() => {}} anchorX={8} anchorY={60} />);
    await waitFor(() => expect(view.getByText('Heart')).toBeTruthy());
    expect(view.getByText('Puck')).toBeTruthy();
    fireEvent.press(view.getByText('Puck'));

    view.rerender(<VoicePickerPopover visible onClose={() => {}} anchorX={8} anchorY={60} />);
    await waitFor(() => expect(view.getByText('Puck')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Puck', selected: true })).toBeTruthy();
    view.unmount();
  });

  it('offers speech playback when only a remote voice model is selected', async () => {
    const server = await remoteServerManager.addServer({
      name: 'Desk',
      endpoint: 'http://192.168.1.50:7878',
      providerType: 'openai-compatible',
      mediaModels: { voice: 'kokoro' },
    });
    await remoteServerManager.setActiveRemoteMediaModel(server.id, 'voice', 'kokoro');
    const view = render(<TTSButton text="Hello" messageId="reply" />);
    expect(view.getByTestId('tts-button-reply')).toBeTruthy();
    view.unmount();
  });
});
