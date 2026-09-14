import { installNativeBoundary, requireRTL, GB } from '../../harness/nativeBoundary';

describe('Voice model choice', () => {
  it('shows the Kokoro model in Models > Voice without speaker choices', async () => {
    installNativeBoundary({ fs: true, ram: { platform: 'android', totalBytes: 8 * GB, availBytes: 6 * GB } });
    const { ttsRegistry } = require('../../../pro/audio/engine');
    await ttsRegistry.setActiveEngine('kokoro');

    const React = require('react');
    const { render, waitFor } = requireRTL();
    const { VoiceModelsPanel } = require('../../../pro/audio/ui/VoiceModelsPanel');
    const panel = render(React.createElement(VoiceModelsPanel, { showRemoteModels: false }));

    await waitFor(() => expect(panel.getByText('Kokoro TTS')).toBeTruthy());
    expect(panel.getByTestId('voice-model-kokoro-download')).toBeTruthy();
    expect(panel.queryByText('Warm')).toBeNull();
    expect(panel.queryByTestId('models-tts-language')).toBeNull();
  });
});
