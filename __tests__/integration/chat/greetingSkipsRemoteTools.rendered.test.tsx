import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

describe('greeting with remote tools enabled', () => {
  it('answers on the selected model without sending unrelated remote tools', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'ios', pro: true, backupModel: true });
    const { useMcpStore } = require('../../../pro/mcp/mcpStore');
    const mcp = useMcpStore.getState();
    mcp.addServer({ id: 'greeting-server', name: 'Mac tools', url: 'http://mac.local/mcp' });
    mcp.setConnectionState('greeting-server', 'connected');
    mcp.setServerTools('greeting-server', Array.from({ length: 17 }, (_, i) => ({
      name: `remote_action_${i}`,
      description: `Run remote action ${i} on the Mac`,
      inputSchema: { type: 'object', properties: {} },
    })));
    h.render();
    h.boundary.llama!.scriptCompletion({ text: 'Hello!' });

    await h.tapSend('Hi');

    await h.rtl.waitFor(() => expect(h.view!.queryByText('Hello!')).not.toBeNull(), { timeout: 8000 });
    expect(h.view!.getByText('Tools sent in request (3)')).toBeTruthy();
    h.rtl.fireEvent.press(h.view!.getByText('Tools sent in request (3)'));
    expect(h.view!.queryByText('• remote_action_0')).toBeNull();
    expect(h.view!.queryByTestId('tool-result-label-model_fallback')).toBeNull();
    mcp.removeServer('greeting-server');
  });
});
