/**
 * HAPPY-PATH (UI integration) — vision: an image attached to a message on a vision-capable model is
 * included at the native boundary, and the model's answer about it renders.
 *
 * Real generationService + generationToolLoop + liteRTService + ChatMessage; only the native LiteRT leaf is
 * faked (it records the media it was handed). Asserts the attached image URI reached the native model AND
 * the answer renders. Green complement to the B5/B9 media-exclusion guards (which lock audio OUT).
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { createDownloadedModel, createMessage } from '../../utils/factories';
import type { MediaAttachment, Message } from '../../../src/types';

describe('happy — a vision model receives an attached image and answers about it', () => {
  it('includes the image at the native boundary and renders the answer', async () => {
    const boundary = installNativeBoundary({ ram: { platform: 'android', totalBytes: 12 * 1024 ** 3, availBytes: 8 * 1024 ** 3 } });
    /* eslint-disable @typescript-eslint/no-var-requires */
    const React = require('react');
    const { render } = requireRTL();
    const { liteRTService } = require('../../../src/services/litert');
    const { generationService } = require('../../../src/services/generationService');
    const { useAppStore, useChatStore } = require('../../../src/stores');
    const { ChatMessage } = require('../../../src/components/ChatMessage');
    /* eslint-enable @typescript-eslint/no-var-requires */

    await liteRTService.loadModel('/models/gemma.litertlm', 'gpu', { supportsVision: true, maxNumTokens: 4096 });
    useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'lrt', engine: 'litert', liteRTVision: true })], activeModelId: 'lrt' });

    const image: MediaAttachment = { id: 'i1', type: 'image', uri: '/img/cat.jpg' } as MediaAttachment;
    const conversationId = useChatStore.getState().createConversation('lrt');
    useChatStore.getState().addMessage(conversationId, { role: 'user', content: 'what is in this image', attachments: [image] });

    boundary.litert.scriptTurn({ content: 'I see a tabby cat sitting on a windowsill.' });
    await generationService.generateWithTools(conversationId, useChatStore.getState().getConversationMessages(conversationId), { enabledToolIds: [] });

    // The attached image URI reached the native model.
    const mediaArgs = [...boundary.litert.calls.sendMessageWithMedia, ...boundary.litert.calls.sendMessageWithImages].flat(2);
    expect(JSON.stringify(mediaArgs)).toMatch(/\/img\/cat\.jpg/);

    // The model's answer about the image renders.
    const messages: Message[] = useChatStore.getState().getConversationMessages(conversationId);
    const assistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const view = render(React.createElement(ChatMessage, { message: assistant as Message }));
    expect(view.queryByText(/tabby cat sitting on a windowsill/)).not.toBeNull();
    void createMessage;
  });
});
