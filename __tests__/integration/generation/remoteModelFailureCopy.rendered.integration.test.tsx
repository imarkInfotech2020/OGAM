import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { RemoteModelOptionsSection } from '../../../src/components/models/RemoteModelOptionsSection';
import { remoteServerManager } from '../../../src/services/remoteServerManager';

describe('remote model choice failures', () => {
  const originalFetch = global.fetch;
  afterEach(async () => {
    global.fetch = originalFetch;
    await remoteServerManager.clearAllServers();
  });

  async function showImageChoice() {
    await remoteServerManager.clearAllServers();
    const server = await remoteServerManager.addServer({
      name: 'Office Desktop',
      endpoint: 'http://192.168.7.20:7878',
      providerType: 'openai-compatible',
      modelManagement: 'offgrid-desktop-v1',
      modelCatalog: { image: [{ id: 'image-maker', name: 'Image Maker' }] },
    });
    const view = render(<RemoteModelOptionsSection category="image" />);
    const choose = () => fireEvent.press(view.getByTestId(`remote-image-model-${server.id}:image-maker`));
    return { view, choose };
  }

  it('says what still works when the Desktop cannot be reached', async () => {
    const { view, choose } = await showImageChoice();
    global.fetch = (async () => { throw new TypeError('Network request failed'); }) as typeof fetch;
    choose();
    await waitFor(() => {
      expect(view.queryByText(/Could not reach Office Desktop\. Models on this phone still work/)).not.toBeNull();
    });
    view.unmount();
  });

  it('shows the Desktop rejection instead of calling it offline', async () => {
    const { view, choose } = await showImageChoice();
    global.fetch = (async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'This model is not available to this device.' }),
    } as Response)) as typeof fetch;
    choose();
    await waitFor(() => {
      expect(view.queryByText('This model is not available to this device.')).not.toBeNull();
    });
    expect(view.queryByText(/Could not reach Office Desktop/)).toBeNull();
    view.unmount();
  });
});
