/**
 * HAPPY-PATH (UI integration) — image generation across every compute backend, and the user sees BOTH the
 * generated image AND the correct backend label in the message details:
 *   NPU → "QNN (NPU)" · MNN/GPU → "MNN (GPU)" · CPU → "MNN (CPU)" · Metal (iOS) → "Core ML (ANE)".
 *
 * The REAL imageGenerationService runs end to end; the ONLY thing faked is the native diffusion module
 * (LocalDream on Android / CoreML on iOS), which returns a generated-image path + echoes the size. The
 * REAL ChatMessage renders the produced image + its generation-details meta. This is the regression floor:
 * when we start changing code, a broken generate/backend-label path fails here.
 */
import { installNativeBoundary, GB, requireRTL } from '../../harness/nativeBoundary';
import { createONNXImageModel } from '../../utils/factories';

type Cfg = { label: string; backend: 'mnn' | 'qnn'; platform: 'ios' | 'android'; useOpenCL: boolean; expected: string };

async function generateOn(cfg: Cfg) {
  const boundary = installNativeBoundary({ ram: { platform: cfg.platform, totalBytes: 12 * GB, availBytes: 8 * GB } });
  /* eslint-disable @typescript-eslint/no-var-requires */
  const React = require('react');
  const { render } = requireRTL();
  const { imageGenerationService } = require('../../../src/services/imageGenerationService');
  const { localDreamGeneratorService } = require('../../../src/services/localDreamGenerator');
  const { useAppStore, useChatStore } = require('../../../src/stores');
  const { ChatMessage } = require('../../../src/components/ChatMessage');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const model = createONNXImageModel({ id: 'sd', name: 'SD Test', modelPath: '/models/sd', backend: cfg.backend });
  useAppStore.setState({ downloadedImageModels: [model], activeImageModelId: 'sd' });
  useAppStore.getState().updateSettings({ imageThreads: 4, imageUseOpenCL: cfg.useOpenCL, enhanceImagePrompts: false, imageSteps: 8 });

  // Pre-load so the already-loaded fast path is taken (skips the FS integrity gate — the GENERATE path is
  // fully real: native generateImage is called, the result flows through the real service + store + render).
  boundary.diffusion.module.getLoadedModelPath.mockResolvedValue(model.modelPath);
  await localDreamGeneratorService.loadModel(model.modelPath, 4, {});

  const conversationId = useChatStore.getState().createConversation('sd');
  const result = await imageGenerationService.generateImage({ prompt: 'a fox in snow', conversationId });

  const messages = useChatStore.getState().getConversationMessages(conversationId);
  const assistant = [...messages].reverse().find((m: { role: string }) => m.role === 'assistant');
  const view = render(React.createElement(ChatMessage, { message: assistant, showGenerationDetails: true }));
  return { result, view, nativeCalls: boundary.diffusion.calls.generateImage };
}

const CONFIGS: Cfg[] = [
  { label: 'NPU (qnn, Android)', backend: 'qnn', platform: 'android', useOpenCL: false, expected: 'QNN (NPU)' },
  { label: 'MNN GPU (Android, OpenCL)', backend: 'mnn', platform: 'android', useOpenCL: true, expected: 'MNN (GPU)' },
  { label: 'CPU (mnn, Android, no OpenCL)', backend: 'mnn', platform: 'android', useOpenCL: false, expected: 'MNN (CPU)' },
  { label: 'Metal (Core ML, iOS)', backend: 'mnn', platform: 'ios', useOpenCL: false, expected: 'Core ML (ANE)' },
];

describe('happy — image generation renders the image + correct backend label', () => {
  it.each(CONFIGS)('$label: produces an image and shows "$expected"', async (cfg) => {
    const { result, view, nativeCalls } = await generateOn(cfg);
    // A real image was produced through the real service + native generateImage.
    expect(result).not.toBeNull();
    expect(nativeCalls.length).toBe(1);
    // The user sees the correct backend label in the message details.
    expect(view.queryByText(new RegExp(cfg.expected.replace(/[()]/g, '\\$&')))).not.toBeNull();
  });
});
