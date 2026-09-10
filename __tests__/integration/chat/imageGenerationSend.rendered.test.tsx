import { Modal } from 'react-native';

import { setupChatScreen } from '../../harness/chatHarness';

describe('Mobile image generation send journey', () => {
  it('sends "Draw a dog" and shows the generated image', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'ios' });
    const view = h.render();

    await h.placeImageModel({ backend: 'coreml' });
    await h.cycleImageMode();
    await h.rtl.waitFor(() => {
      expect(view.getByTestId('image-mode-force-badge')).toBeVisible();
    });
    await h.cycleImageMode();
    await h.cycleImageMode();
    await h.rtl.waitFor(() => {
      expect(
        h.rtl.within(view.getByTestId('quick-image-mode')).getByText('Auto'),
      ).toBeVisible();
    });

    const quickSettingsModal = view
      .UNSAFE_getAllByType(Modal)
      .find(modal => h.rtl.within(modal).queryByTestId('quick-image-mode'));
    if (!quickSettingsModal) {
      throw new Error('The open quick-settings menu could not be closed.');
    }
    h.rtl.fireEvent(quickSettingsModal, 'requestClose');
    await h.rtl.waitFor(() => {
      expect(view.queryByTestId('quick-image-mode')).toBeNull();
    });

    await h.tapSend('Draw a dog');
    await h.rtl.waitFor(() => {
      expect(view.getByText('Draw a dog')).toBeVisible();
      return view.getByTestId('generated-image-content');
    });

    h.rtl.fireEvent(view.getByTestId('generated-image-content'), 'load');
    await h.rtl.waitFor(() => {
      expect(view.getByLabelText('Generated image loaded')).toBeTruthy();
      expect(view.getByTestId('chat-input')).toBeEnabled();
    });

    expect(view.queryByText('Generation Error')).toBeNull();
  });
});
