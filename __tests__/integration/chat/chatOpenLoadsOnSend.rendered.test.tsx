import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

describe('opening a new chat with a selected local model', () => {
  it('waits for the first message before loading the model', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'ios', deferInitialLoad: true });
    h.render();

    await h.settle(500);
    expect(h.view!.queryByText('Start a Conversation')).not.toBeNull();
    expect(h.boundary.llama!.module.initLlama).not.toHaveBeenCalled();
    expect(h.view!.queryByText('Load Anyway')).toBeNull();

    await h.send('Hi', { text: 'Hello.' });
    await h.rtl.waitFor(() => expect(h.view!.queryByText('Hello.')).not.toBeNull());
    expect(h.boundary.llama!.module.initLlama).toHaveBeenCalledTimes(1);
  });

});
