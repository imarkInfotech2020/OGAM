import { installNativeBoundary, requireRTL, GB } from '../../harness/nativeBoundary';

describe('cached voice model availability', () => {
  it('enters Voice mode after a ready cached runtime repairs missing install metadata', async () => {
    installNativeBoundary({
      fs: true,
      ram: { platform: 'ios', totalBytes: 8 * GB, availBytes: 6 * GB },
    });

    const React = require('react');
    const { NavigationContainer } = require('@react-navigation/native');
    const { render, fireEvent, act, waitFor } = requireRTL();
    const { useTTSStore } = require('../../../pro/audio/ttsStore');
    const { ttsRegistry } = require('../../../pro/audio/engine');
    const { EngineBridge } = require('../../../pro/audio/ui/EngineBridge');
    const { ChatInputModeToggle } = require('../../../pro/audio/ui/ChatInputModeToggle');

    await ttsRegistry.releaseAll();
    useTTSStore.getState().updateSettings({
      interfaceMode: 'chat',
      engineId: 'kokoro',
      modelDownloaded: { kokoro: true },
    });
    await useTTSStore.getState().setEngine('kokoro');

    const view = render(
      React.createElement(
        NavigationContainer,
        null,
        React.createElement(React.Fragment, null,
          React.createElement(EngineBridge),
          React.createElement(ChatInputModeToggle),
        ),
      ),
    );

    await waitFor(() => expect(useTTSStore.getState().isReady).toBe(true));

    // Reproduce the affected device state: Kokoro is already usable, but its
    // older persisted install record is absent. Release and reload through the
    // same public actions used by residency and Voice-mode initialization.
    await act(async () => {
      useTTSStore.getState().updateSettings({ modelDownloaded: {} });
      await useTTSStore.getState().releaseEngine();
      await useTTSStore.getState().initializeEngine({ override: true });
    });

    await waitFor(() => {
      expect(useTTSStore.getState().settings.modelDownloaded?.kokoro).toBe(true);
    });

    fireEvent.press(view.getByTestId('chat-mode-toggle'));
    await waitFor(() => {
      expect(useTTSStore.getState().settings.interfaceMode).toBe('audio');
    });
    expect(view.queryByText('No voice model')).toBeNull();

    await ttsRegistry.releaseAll();
  });
});
