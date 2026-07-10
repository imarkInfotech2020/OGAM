/**
 * RED-FLOW (UI, rendered) — Q4 at the pixel: the on-device tool router force-selects a tool merely
 * NAMED in the router model's decline prose, and the user sees it in the "Tools sent" row of the reply.
 *
 * Full stack: a real MCP tool extension (6 tools → routing threshold met, isMcpEnabled), the REAL
 * generationToolLoop + LiteRT two-pass router (a separate generateToolSelection round trip, scripted via
 * scriptTurns), real generationService + chatStore; only the native LiteRTModule is faked. Renders the
 * REAL ChatMessage and asserts the routed-tools row the user sees.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';
import type { Message } from '../../../src/types';

const MCP_TOOLS = ['mcp_weather', 'mcp_calendar', 'mcp_email', 'mcp_notes', 'mcp_slack', 'mcp_docs'].map(name => ({
  type: 'function', function: { name, description: `${name} tool`, parameters: { type: 'object', properties: {} } },
}));

describe('Q4 (rendered) — router false-positive shows a wrong tool in the reply', () => {
  it('does not route a tool the model only named while declining', async () => {
    const boundary = installNativeBoundary({ ram: { platform: 'android', totalBytes: 12 * 1024 ** 3, availBytes: 8 * 1024 ** 3 } });
    /* eslint-disable @typescript-eslint/no-var-requires */
    const React = require('react');
    const { render } = requireRTL();
    const { liteRTService } = require('../../../src/services/litert');
    const { generationService } = require('../../../src/services/generationService');
    const { useAppStore, useChatStore } = require('../../../src/stores');
    const { registerToolExtension, _clearExtensionsForTesting } = require('../../../src/services/tools/extensions');
    const { ChatMessage } = require('../../../src/components/ChatMessage');
    /* eslint-enable @typescript-eslint/no-var-requires */

    _clearExtensionsForTesting();
    registerToolExtension({
      id: 'mcp',
      getSystemPromptHint: () => '',
      getOpenAISchemas: () => MCP_TOOLS,
      parseToolCalls: () => [],
      stripFromVisibleText: (t: string) => t,
      canHandle: (name: string) => MCP_TOOLS.some(t => t.function.name === name),
      execute: async (call: { id: string; name: string }) => ({ toolCallId: call.id, name: call.name, content: 'ok', durationMs: 1 }),
      enabledToolCount: () => MCP_TOOLS.length,
    });

    await liteRTService.loadModel('/models/gemma.litertlm', 'gpu', { maxNumTokens: 4096 });
    useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'lrt', engine: 'litert' })], activeModelId: 'lrt' });
    const conversationId = useChatStore.getState().createConversation('lrt');
    useChatStore.getState().addMessage(conversationId, { role: 'user', content: 'hello there' });

    // Turn 1 = the router's decline prose (which names a tool as a substring); Turn 2 = the plain answer.
    boundary.litert.scriptTurns([
      { content: 'None of these tools are needed for a simple greeting — not even mcp_weather.' },
      { content: 'Hello! How can I help?' },
    ]);

    await generationService.generateWithTools(
      conversationId,
      useChatStore.getState().getConversationMessages(conversationId),
      { enabledToolIds: [] },
    );

    const messages: Message[] = useChatStore.getState().getConversationMessages(conversationId);
    const assistant = [...messages].reverse().find(m => m.role === 'assistant');
    const { queryByText } = render(React.createElement(ChatMessage, { message: assistant as Message, showGenerationDetails: true }));

    _clearExtensionsForTesting();
    // Correct: the router declined, so no tool is shown as sent. Today the substring match on
    // "mcp_weather" force-selects it (litertToolSelector returns before the 'none' branch) → RED.
    expect(queryByText(/mcp_weather/)).toBeNull();
  });
});
