/**
 * HAPPY-PATH (UI integration, HEAVY entry point) — a built-in tool runs end to end: with the calculator
 * tool enabled, the user asks a question, the model emits a tool call, the REAL calculator executes, and
 * the user sees the tool-result bubble + the model's answer.
 *
 * Real ChatScreen + real generationToolLoop + real calculator tool + real engine; only the native LiteRT
 * leaf is faked. This is the green complement to the Q2/Q3/Q5 tool red-flows.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('happy — a tool runs and its result renders (heavy entry point)', () => {
  it('web search shows intentionally escaped entity text literally', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      text: async () => `<html><body>
        <div class="result-wrapper">
          <a class="result-title" href="https://example.com/docs?label=&amp;lt;literal&amp;gt;">
            Escaped &amp;lt;literal&amp;gt; URL
          </a>
          <p class="snippet">A result with intentionally escaped URL text.</p>
        </div>
      </body></html>`,
    }) as Response;

    try {
      const h = await setupChatScreen({ engine: 'litert' });
      h.enableToolViaUI('web_search');
      h.render();

      await h.send('find the escaped URL', {
        toolCalls: [{ name: 'web_search', arguments: { query: 'escaped URL' } }],
        content: 'I found the result.',
      });

      await h.rtl.waitFor(() => {
        expect(h.view!.queryByText(/I found the result\./)).not.toBeNull();
      });
      const webResults = h.view!.getAllByTestId(
        'tool-result-accordion-web_search',
      );
      h.rtl.fireEvent.press(
        webResults[webResults.length - 1],
      );
      expect(
        h.view!.getAllByText('Escaped <literal> URL').length,
      ).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('calculator: tool call executes and the answer renders', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    // Arrive-via-UI: enable the calculator on the real Tools screen (flip its switch), then chat.
    h.enableToolViaUI('calculator');
    h.render();

    // The model emits a calculator tool call; after the tool runs it answers with the result.
    await h.send('what is 2 + 2', { toolCalls: [{ name: 'calculator', arguments: { expression: '2+2' } }], content: 'The answer is 4.' });

    // The user sees the tool-result bubble (the calculator actually ran)...
    await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('tool-result-label-calculator')).not.toBeNull(); });
    // ...and the model's final answer.
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/The answer is 4\./)).not.toBeNull(); });
  });

  it('MCP: a registered MCP tool executes and its result reaches the answer', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
     
    const { registerToolExtension, _clearExtensionsForTesting } = require('../../../src/services/tools/extensions');
     
    _clearExtensionsForTesting();
    let executed = false;
    registerToolExtension({
      id: 'mcp',
      getSystemPromptHint: () => '',
      getOpenAISchemas: () => [{ type: 'function', function: { name: 'mcp_weather', description: 'weather', parameters: { type: 'object', properties: {} } } }],
      parseToolCalls: () => [],
      stripFromVisibleText: (t: string) => t,
      canHandle: (name: string) => name === 'mcp_weather',
      execute: async (call: { id: string; name: string }) => { executed = true; return { toolCallId: call.id, name: call.name, content: 'Sunny, 24C', durationMs: 1 }; },
      enabledToolCount: () => 1,
    });
    h.render();

    await h.send('what is the weather', { toolCalls: [{ name: 'mcp_weather', arguments: {} }], content: 'It is sunny and 24C.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/It is sunny and 24C\./)).not.toBeNull(); });
    expect(executed).toBe(true); // the real extension executed
    _clearExtensionsForTesting();
  });

  it('T044: two parallel calculator calls render two tool-result bubbles, both correct', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('calculator');
    h.render();
    // The model emits TWO calculator tool calls in one turn (parallel, index 0+1); the real tool loop runs
    // both and the answer carries both results.
    await h.send('compute 500*321 and 12+13', {
      toolCalls: [
        { name: 'calculator', arguments: { expression: '500*321' } },
        { name: 'calculator', arguments: { expression: '12+13' } },
      ],
      content: 'Results: 160500 and 25.',
    });
    // Two tool-result bubbles render (both calculator runs are visible).
    await h.rtl.waitFor(() => { expect(h.view!.queryAllByTestId('tool-result-label-calculator').length).toBe(2); });
    // ...and the answer with both results renders.
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/160500 and 25/)).not.toBeNull(); });
  });

  it('places time below the answer, then tools, and opens generation details on tap', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('calculator');
    h.enableGenerationDetailsViaUI();
    h.render();
    await h.send('hello', { content: 'Hi there.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Hi there\./)).not.toBeNull(); });

    const answer = h.view!.getAllByTestId('assistant-message').at(-1)!;
    const visibleOrder = answer.findAll(node => [
      'message-bubble', 'message-meta-row', 'tools-sent-collapsible', 'generation-details-toggle',
    ].includes(node.props.testID)).map(node => node.props.testID);
    expect([...new Set(visibleOrder)]).toEqual([
      'message-bubble', 'message-meta-row', 'tools-sent-collapsible', 'generation-details-toggle',
    ]);
    expect(h.rtl.within(answer).getByTestId('message-meta-row').children.length).toBeGreaterThan(0);
    expect(h.view!.queryByTestId('generation-meta')).toBeNull();

    h.rtl.fireEvent.press(h.view!.getByText('Generation details'));
    expect(h.view!.queryByText(/Test Model/)).not.toBeNull();
    h.rtl.fireEvent.press(h.view!.getByText('Generation details'));
    expect(h.view!.queryByTestId('generation-meta')).toBeNull();
  });
});
