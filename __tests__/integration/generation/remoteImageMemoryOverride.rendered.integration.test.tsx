import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('remote image memory refusal in Chat', () => {
  const originalFetch = global.fetch;
  afterEach(async () => {
    global.fetch = originalFetch;
    const { remoteServerManager } = require('../../../src/services/remoteServerManager');
    await remoteServerManager.clearAllServers();
  });

  it('routes a remote-only image, shows the server reason, and sends Run anyway only after a tap', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'android' });
    const { remoteServerManager } = require('../../../src/services/remoteServerManager');
    const { useRemoteServerStore } = require('../../../src/stores/remoteServerStore');
    const server = await remoteServerManager.addServer({
      name: 'Paired Desktop',
      endpoint: 'http://192.168.7.20:7881',
      providerType: 'openai-compatible',
      mediaModels: { image: 'remote-image' },
    });
    useRemoteServerStore.getState().setActiveRemoteMediaServerId('image', server.id);

    const requests: Array<Record<string, unknown>> = [];
    global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requests.push(body);
      if (body.allow_unsafe_memory_override !== true) {
        return {
          ok: false,
          status: 507,
          text: async () => JSON.stringify({ error: { message: 'OFFGRID_IMAGE_MEMORY_LIMIT:Server needs more image memory.' } }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }] }),
      } as Response;
    }) as typeof fetch;

    h.render();
    await h.cycleImageMode();
    await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('image-mode-force-badge')).not.toBeNull(); });
    await h.tapSend('a fox in snow');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Server needs more image memory/)).not.toBeNull(); });
    expect(h.view!.queryByText('Run anyway')).not.toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.allow_unsafe_memory_override).not.toBe(true);

    h.rtl.fireEvent.press(h.view!.getByText('Run anyway'));
    await h.rtl.waitFor(() => { expect(requests.length).toBe(2); });
    expect(requests[1]?.allow_unsafe_memory_override).toBe(true);
  });

  it('shows an ordinary provider rejection without a memory override', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'android' });
    const { remoteServerManager } = require('../../../src/services/remoteServerManager');
    const { useRemoteServerStore } = require('../../../src/stores/remoteServerStore');
    const server = await remoteServerManager.addServer({
      name: 'Provider',
      endpoint: 'http://192.168.7.22:7881',
      providerType: 'openai-compatible',
      mediaModels: { image: 'remote-image' },
    });
    useRemoteServerStore.getState().setActiveRemoteMediaServerId('image', server.id);
    global.fetch = (async () => ({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'Provider quota exhausted.' } }),
    } as Response)) as typeof fetch;

    h.render();
    await h.cycleImageMode();
    await h.tapSend('a fox in snow');
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Provider quota exhausted/)).not.toBeNull(); });
    expect(h.view!.queryByText('Run anyway')).toBeNull();
  });
});
