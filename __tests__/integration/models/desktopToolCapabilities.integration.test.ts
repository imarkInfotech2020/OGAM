import { readOffGridDesktopModelState } from '../../../src/services/offGridDesktopModels';
import type { RemoteServer } from '../../../src/types';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const desktop: RemoteServer = {
  id: 'paired-desktop',
  name: 'Paired Desktop',
  endpoint: 'http://192.168.7.20:7878',
  providerType: 'openai-compatible',
  modelManagement: 'offgrid-desktop-v1',
  createdAt: '2026-09-18T00:00:00.000Z',
};

describe('paired Desktop model capabilities across the gateway HTTP boundary', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ['offloaded without a capability declaration', undefined, true],
    ['loaded and advertising tools', ['vision', 'tools'], true],
    ['loaded and advertising no tools', ['vision'], false],
  ])('%s', async (_scenario, capabilities, expectedTools) => {
    installNativeBoundary();
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/v1/models/catalog')
        ? {
            models: [{ id: 'arbitrary/new-model', name: 'New Model', kind: 'vision', files: [] }],
            kinds: ['vision'],
          }
        : url.endsWith('/v1/models/installed')
          ? { installed: ['arbitrary/new-model'] }
          : url.endsWith('/v1/models/active')
            ? { text: 'arbitrary/new-model' }
            : url.endsWith('/v1/models')
              ? { data: [{ id: 'arbitrary/new-model', ...(capabilities === undefined ? {} : { capabilities }) }] }
              : null;
      if (body === null) throw new Error(`Unexpected Desktop request: ${url}`);
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;

    const state = await readOffGridDesktopModelState(desktop);

    expect(state?.active.text).toBe('arbitrary/new-model');
    expect(state?.textModels).toHaveLength(1);
    const React = require('react');
    const { render } = requireRTL();
    const { TextTab } = require('../../../src/components/ModelSelectorModal/TextTab');
    const picker = render(React.createElement(TextTab, {
      downloadedModels: [],
      remoteModels: [{ serverId: desktop.id, serverName: desktop.name, models: state!.textModels }],
      currentModelPath: null,
      currentRemoteModelId: 'arbitrary/new-model',
      isAnyLoading: false,
      onSelectModel: () => {},
      onSelectRemoteModel: () => {},
      onUnloadModel: () => {},
      onAddServer: () => {},
    }));
    expect(Boolean(picker.queryAllByLabelText('Tool calling').length)).toBe(expectedTools);
    picker.unmount();
  });
});
