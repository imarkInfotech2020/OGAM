/**
 * HAPPY-PATH (UI integration) — the mainline chat send: the user asks a question on a loaded LiteRT model
 * and SEES the model's answer rendered in the assistant bubble.
 *
 * Same discipline as the red-flows: only the native LiteRTModule is faked (via the shared harness). The
 * REAL generationService + generationToolLoop + liteRTService + chatStore run, and we render the REAL
 * ChatMessage the pipeline produced. This is the floor the reds lean on — it asserts the mainline directly
 * instead of only implying it through a bug test's setup. GREEN today; it fails if a fix breaks normal send.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';
import type { Message } from '../../../src/types';

describe('happy — normal chat send renders the model answer', () => {
  it('shows the assistant reply the user asked for', async () => {
    const boundary = installNativeBoundary({ ram: { platform: 'android', totalBytes: 12 * 1024 ** 3, availBytes: 8 * 1024 ** 3 } });
    /* eslint-disable @typescript-eslint/no-var-requires */
    const React = require('react');
    const { render } = requireRTL();
    const { liteRTService } = require('../../../src/services/litert');
    const { generationService } = require('../../../src/services/generationService');
    const { useAppStore, useChatStore } = require('../../../src/stores');
    const { ChatMessage } = require('../../../src/components/ChatMessage');
    /* eslint-enable @typescript-eslint/no-var-requires */

    await liteRTService.loadModel('/models/gemma.litertlm', 'gpu', { maxNumTokens: 4096 });
    useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'lrt', engine: 'litert' })], activeModelId: 'lrt' });

    const conversationId = useChatStore.getState().createConversation('lrt');
    useChatStore.getState().addMessage(conversationId, { role: 'user', content: 'what is the capital of France' });

    // The model answers normally (no tools needed).
    boundary.litert.scriptTurn({ content: 'The capital of France is Paris.' });

    await generationService.generateWithTools(
      conversationId,
      useChatStore.getState().getConversationMessages(conversationId),
      { enabledToolIds: [] },
    );

    const messages: Message[] = useChatStore.getState().getConversationMessages(conversationId);
    const assistant = [...messages].reverse().find(m => m.role === 'assistant');
    expect(assistant).toBeDefined();

    const { queryByText } = render(React.createElement(ChatMessage, { message: assistant as Message }));
    // The user sees the answer, and there is no dead-end fallback.
    expect(queryByText(/The capital of France is Paris\./)).not.toBeNull();
    expect(queryByText(/\(No response\)/)).toBeNull();
  });
});
