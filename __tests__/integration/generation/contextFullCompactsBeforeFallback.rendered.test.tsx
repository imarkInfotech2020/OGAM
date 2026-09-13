import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

describe('context full in a tool-enabled chat', () => {
  it('retries after compaction on the selected model without a model-change notice', async () => {
    const h = await setupChatScreen({ engine: 'llama', backupModel: true });
    h.enableToolViaUI('calculator');
    h.enableGenerationDetailsViaUI();
    h.render();

    // The native engine reports a full context for the first attempt. The next native
    // completion can answer after the app clears and compacts its context.
    h.boundary.llama!.scriptCompletions([
      { completionMeta: { context_full: true } },
      { text: 'Answer from selected model.' },
    ]);
    await h.tapSend('Hi');

    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText('Answer from selected model.')).not.toBeNull();
    }, { timeout: 8000 });
    expect(h.view!.queryByTestId('tool-result-label-model_fallback')).toBeNull();
    h.rtl.fireEvent.press(h.view!.getByText('Generation details'));
    expect(h.view!.queryByText('Test Model')).not.toBeNull();
  });

  it('shows a context limit after the retry also fills, and ends the busy state', async () => {
    const h = await setupChatScreen({ engine: 'llama', backupModel: true });
    h.enableToolViaUI('calculator');
    h.render();
    h.boundary.llama!.scriptCompletions([
      { completionMeta: { context_full: true } },
      { completionMeta: { context_full: true } },
    ]);
    await h.tapSend('Hi');

    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText('Context window full')).not.toBeNull();
    }, { timeout: 8000 });
    expect(h.view!.queryByText('No response')).toBeNull();
    expect(h.view!.queryByTestId('tool-result-label-model_fallback')).toBeNull();
    expect(h.view!.queryByTestId('stop-button')).toBeNull();
  });
});
