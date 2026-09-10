/**
 * chatHarness — heavy-entry-point setup for UI-level chat integration tests.
 *
 * Mounts the REAL ChatScreen and drives it via REAL user actions (type into the real input, press the real
 * send button), with ONLY the native leaves faked (via nativeBoundary). Everything we own — the screen,
 * useChatScreen, generationService, the tool loop, the engine services, the stores, residency — runs for
 * real. This is the "integration test, heavy entry point" contract.
 *
 * Usage (the jest.mock for navigation MUST be top-level in the test file — it is hoisted — and points its
 * route at this module's shared `routeHolder`):
 *
 *   jest.mock('@react-navigation/native', () => ({
 *     useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
 *     useRoute: () => require('../../harness/chatHarness').routeHolder,
 *     useFocusEffect: () => {}, useIsFocused: () => true,
 *   }));
 *
 *   const h = await startChatScreen(usingLlama());          // starts the real Chat screen
 *   await h.send('what is the capital of France', { text: 'Paris.' });  // types, presses send, awaits reply
 *   expect(h.view.queryByText(/Paris\./)).not.toBeNull();
 */
import {
  installNativeBoundary,
  requireRTL,
  GB,
  type RamProfile,
  type CompletionMeta,
} from './nativeBoundary';
import { createDownloadedModel } from '../utils/factories';
import { doMockRealSqlite } from './sqliteFake';
import { ChatScenario, type ChatScenarioOptions } from './chatScenario';

export {
  CHAT_LOCAL_IMAGE_SCENARIOS,
  CHAT_LOCAL_TEXT_SCENARIOS,
  CHAT_DOCUMENT_ATTACHMENT_SCENARIOS,
  CHAT_IMAGE_SCENARIOS,
  CHAT_IMAGE_GENERATION_SCENARIOS,
  CHAT_PHOTO_ATTACHMENT_SCENARIOS,
  CHAT_REMOTE_IMAGE_SCENARIOS,
  CHAT_SCENARIO_MATRIX,
  CHAT_THINKING_DISABLED_SCENARIOS,
  CHAT_TEXT_SCENARIOS,
  getBackendForPlatform,
  usingEngine,
  usingLiteRT,
  usingLlama,
  usingRemoteText,
  withoutTextModel,
} from './chatScenario';

/** Shared route params the test's navigation mock reads (set by setupChatScreen). */
export const routeHolder: { params: Record<string, unknown> } = { params: {} };

export interface ChatHarnessOptions extends ChatScenarioOptions {
  engine: ChatScenario['engine'];
  /** 'ios' surfaces the Metal accelerator path for llama; default 'android'. */
  platform?: 'ios' | 'android';
  ram?: RamProfile;
  /** Make the (LiteRT) model vision-capable so the attach-photo gesture is allowed. */
  vision?: boolean;
  /** Make the (LiteRT) model audio-capable (liteRTAudio) — so supportsDirectAudio() is true and chat-mode
   *  hold-to-talk exercises the direct-audio recording path (not the whisper-realtime path). */
  audio?: boolean;
  /** Install the driveable whisper.rn STT fake (for chat-mode voice input flows). */
  whisper?: boolean;
  /** Install the stateful background-download native fake (drive DownloadProgress/Complete/Error
   *  events through the real backgroundDownloadService — e.g. an in-flight STT model download). */
  download?: boolean;
  /** Activate the PRO feature set (audio/voice mode header toggle, audio layout, TTS, MCP) via the real
   *  bootstrap, so pro user-flows are reachable in the mounted screen. */
  pro?: boolean;
  /** Skip the deterministic pre-load after model select, so the model is selected-but-not-loaded exactly
   *  as the real lazy flow leaves it (load defers to the first send). Use to assert the lazy-on-select
   *  invariant (no eager warm) via the In Memory section. Default false (pre-load for send determinism). */
  deferInitialLoad?: boolean;
  /** Override the installed model's display name / file name — for flows whose behavior keys on the
   *  model identity (e.g. the name-based capability prediction for a selected-but-not-loaded gguf). */
  modelName?: string;
  modelFileName?: string;
  /** Override the test model's declared fileSize (drives the residency budget). Default 2GB — a
   *  realistic small model that fits the default 8GB-avail profile. Memory tests set this explicitly. */
  modelFileSizeBytes?: number;
  /** (llama) GGUF chat_template on the model context's metadata — drives the REAL Thinking-capability
   *  detection. Omit for the reasoning-capable default; pass a marker-free template (Mistral's tool-use
   *  template) to model a model that does NOT support thinking so the Thinking toggle stays hidden. */
  chatTemplate?: string;
}

type ChatTextScript = {
  text?: string;
  content?: string;
  reasoning?: string;
  thinkingText?: string;
  throwMessage?: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
  completionMeta?: CompletionMeta;
  pauseAfter?: string;
  holdBeforeStream?: boolean;
};

export async function setupChatScreen(opts: ChatHarnessOptions | ChatScenario) {
  const platform = opts.platform ?? 'android';
  const localTextEngine =
    opts.engine === 'llama' || opts.engine === 'litert' ? opts.engine : null;
  const hasLocalTextModel = localTextEngine !== null;
  const ram = opts.ram ?? { platform, totalBytes: 12 * GB, availBytes: 8 * GB };
  const boundary = installNativeBoundary({
    llama: opts.engine === 'llama',
    llamaChatTemplate: opts.chatTemplate,
    fs: true,
    ram,
    whisper: opts.whisper,
    download: opts.download,
  });
  const originalXHR = global.XMLHttpRequest;
  const originalFetch = global.fetch;
  // The application root now starts Workspace Content and the generated-image gallery before Home
  // renders. Give both real repositories a real SQLite boundary; the global empty-row stub cannot
  // report schema columns and therefore cannot represent their additive migrations.
  doMockRealSqlite();

  // Global boundary polyfill: React 19's error reporter calls window.dispatchEvent; in the node test
  // env there is no window, so an unrelated crash would mask real errors. This is a jsdom/global shim,
  // NOT app logic.
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  if (!g.window)
    g.window = {
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };

  const React = require('react');
  const rtl = requireRTL();
  const { ActionSheetIOS } =
    require('react-native') as typeof import('react-native');
  const originalShowActionSheet = ActionSheetIOS.showActionSheetWithOptions;
  const actionSheetSelections: number[] = [];
  if (platform === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions = ((_options, select) => {
      const index = actionSheetSelections.shift();
      if (index === undefined) {
        throw new Error(
          'The iOS action-sheet boundary has no scripted choice.',
        );
      }
      select(index);
    }) as typeof ActionSheetIOS.showActionSheetWithOptions;
  }

  // BOUNDARY (not a gesture): a downloaded model = a persisted record (@local_llm/downloaded_models) + the
  // file on disk — exactly what a real download leaves. Downloading is native and can't be gestured in jest,
  // so we pre-place ONLY this. Everything above it (hydration, the picker, selection, load) runs for real.

  const AsyncStorage =
    require('@react-native-async-storage/async-storage').default ??
    require('@react-native-async-storage/async-storage');

  const docs = boundary.fs!.DocumentDirectoryPath;
  boundary.fs!.seedTextFile(
    '/mock/document.txt',
    'A document selected through the native file picker boundary.',
  );
  const fileName =
    opts.modelFileName ??
    (opts.engine === 'litert' ? 'gemma.litertlm' : 'ggml-small.gguf');
  const modelPath = `${docs}/models/${fileName}`;
  // fileSize drives the residency budget. The factory default is 4GB, which under the GPU-aware text
  // overhead (2.2× on a non-CPU backend, e.g. iOS METAL) needs ~8.8GB and no longer fits the default
  // 8GB-avail profile — so a chat-flow test (not a memory test) would spuriously hit the fit refusal.
  // A realistic small model (2GB) is device-faithful and loads under the budget; memory/OOM tests set
  // their own explicit sizes + RAM profiles and are unaffected.
  const fileSize = opts.modelFileSizeBytes ?? 2 * 1024 * 1024 * 1024;
  const model = !hasLocalTextModel
    ? null
    : createDownloadedModel({
        id: 'm',
        name: opts.modelName ?? 'Test Model',
        engine: localTextEngine,
        filePath: modelPath,
        fileName,
        fileSize,
        liteRTVision: opts.vision,
        liteRTAudio: opts.audio,
      });
  if (model) boundary.fs!.seedFile(modelPath, 500 * 1024 * 1024);
  await AsyncStorage.setItem(
    '@local_llm/downloaded_models',
    JSON.stringify(model ? [model] : []),
  );
  await AsyncStorage.setItem(
    'local-llm-app-storage',
    JSON.stringify({
      state: {
        hasCompletedOnboarding: true,
        checklistDismissed: true,
        onboardingChecklist: {
          downloadedModel: true,
          loadedModel: true,
          sentMessage: true,
          triedImageGen: true,
          exploredSettings: true,
          createdProject: true,
        },
      },
      version: 0,
    }),
  );

  const { hardwareService } = require('../../src/services/hardware');
  const { useAppStore, useChatStore } = require('../../src/stores');
  await hardwareService.refreshMemoryInfo();

  // This fixture represents a returning user. The completed checklist is seeded at the durable
  // profile boundary before the real store hydrates, so spotlight steps cannot intercept chat
  // gestures and the journey never manufactures application state with a direct store write.

  const { startMobileApplicationFixture } =
    require('./mobileApplicationFixture') as typeof import('./mobileApplicationFixture');
  const applicationFixture = await startMobileApplicationFixture({
    pro: opts.pro,
  });
  const { HomeScreen } = require('../../src/screens/HomeScreen');

  const placeLocalImageModel = async (
    imgOpts: {
      id?: string;
      backend?: 'mnn' | 'qnn' | 'coreml';
      size?: number;
    } = {},
  ) => {
    const { id = 'sd', backend = 'coreml', size } = imgOpts;
    const archiveName = `${id}-${backend}.zip`;
    const sourceUri = `/external/${archiveName}`;
    boundary.fs!.seedTextFile(sourceUri, 'PK', 1024);
    const zip = require('react-native-zip-archive') as { unzip: jest.Mock };
    zip.unzip.mockImplementation(
      async (_archive: string, destination: string) => {
        const seedFile = (name: string, bytes = 8 * 1024 * 1024) =>
          boundary.fs!.seedFile(`${destination}/${name}`, bytes);
        if (backend === 'mnn' || backend === 'qnn') {
          ['pos_emb.bin', 'token_emb.bin', 'tokenizer.json'].forEach(name =>
            seedFile(name),
          );
          if (backend === 'mnn') {
            [
              'unet.mnn',
              'unet.mnn.weight',
              'vae_decoder.mnn',
              'vae_decoder.mnn.weight',
              'clip_v2.mnn',
              'clip_v2.mnn.weight',
            ].forEach(name => seedFile(name));
          } else {
            ['unet.bin', 'vae_decoder.bin', 'clip_v2.mnn'].forEach(name =>
              seedFile(name),
            );
          }
        } else {
          boundary.fs!.seedDir(`${destination}/model.mlmodelc`);
          seedFile('model.mlmodelc/model.bin', size ?? 8 * 1024 * 1024);
        }
        return destination;
      },
    );

    const { importMobileImageArchive } =
      require('../../src/services/adapters/models/library/imageArchiveImportAdapter') as typeof import('../../src/services/adapters/models/library/imageArchiveImportAdapter');
    const imported = await importMobileImageArchive({
      sourceUri,
      fileName: archiveName,
    });
    if (imported.status !== 'imported') {
      throw new Error(
        `Image model import failed during ${imported.stage}: ${imported.error}`,
      );
    }
    await applicationFixture.refreshModels();
    const projected = applicationFixture.application.models
      .snapshot()
      .inventory.find(candidate => candidate.id === imported.model.id);
    if (!projected)
      throw new Error(
        'Imported image model was not published to the application inventory.',
      );
    return imported.model;
  };

  const placeRemoteImageModel = async () => {
    const { installRemoteImageModel, installRemoteImageResponse } =
      require('./remoteHarness') as typeof import('./remoteHarness');
    installRemoteImageResponse();
    const remote = await installRemoteImageModel();
    await applicationFixture.refreshModels();
    return remote;
  };

  let scenarioImagePlaced = false;

  if (opts.engine === 'remote') {
    const { installRemoteModel } =
      require('./remoteHarness') as typeof import('./remoteHarness');
    await installRemoteModel({
      caps: {
        supportsVision: true,
        supportsToolCalling: true,
        supportsThinking: true,
      },
    });
    await applicationFixture.refreshModels();
  }
  if (
    opts.engine === 'none' &&
    opts instanceof ChatScenario &&
    opts.imageBackend
  ) {
    if (opts.imageBackend === 'remote') await placeRemoteImageModel();
    else await placeLocalImageModel({ backend: opts.imageBackend });
    scenarioImagePlaced = true;
  }

  // GESTURE: mount the real Home screen — its REAL hydration loads the record — then open the picker and TAP
  // the model row. The real handleSelectTextModel sets it active (no setState activeModelId shortcut).
  const home = rtl.render(
    React.createElement(HomeScreen, {
      navigation: {
        navigate: () => {},
        goBack: () => {},
        setOptions: () => {},
        addListener: () => () => {},
      },
    }),
  );
  if (hasLocalTextModel) {
    await rtl.waitFor(
      () => {
        expect(useAppStore.getState().downloadedModels.length).toBeGreaterThan(
          0,
        );
      },
      { timeout: 4000 },
    );
    rtl.fireEvent.press(
      await rtl.waitFor(() => home.getByTestId('browse-models-button')),
    );
    const rows = await rtl.waitFor(
      () => {
        const r = home.queryAllByTestId(/^text-model-row-/);
        expect(r.length).toBeGreaterThan(0);
        return r;
      },
      { timeout: 4000 },
    );
    rtl.fireEvent.press(rows[0]);
  }
  await rtl.waitFor(
    () => {
      // The selection is the shared active route; the store carries no selection field any more.
      expect(
        applicationFixture.application.models.snapshot().active.text?.model
          ?.id ?? null,
      ).toBe(
        opts.engine === 'remote'
          ? 'remote-model'
          : hasLocalTextModel
          ? 'm'
          : null,
      );
    },
    { timeout: 4000 },
  );
  await rtl.waitFor(
    () => {
      // The user cannot start the next action until the picker has finished closing.
      if (hasLocalTextModel)
        expect(home.queryAllByTestId(/^text-model-row-/)).toHaveLength(0);
    },
    { timeout: 4000 },
  );

  // GESTURE: with the model now selected, tap "New Chat" on Home — the real way a user starts a chat. A new
  // chat has NO conversation yet; it is created on the first message (real app behavior). No createConversation.
  rtl.fireEvent.press(
    await rtl.waitFor(() => home.getByTestId('new-chat-button')),
  );
  home.unmount();

  // Load via the REAL load path (the app loads lazily on the first send; we trigger the same path so the
  // readiness gate passes deterministically). This is the real native-faked load, not a state shortcut.
  // deferInitialLoad leaves the model selected-but-not-loaded (the real lazy-on-select state) so a test
  // can assert nothing is eager-warmed; the first send then triggers the real lazy load.
  if (!opts.deferInitialLoad && hasLocalTextModel) {
    const { modelsFailureMessage } =
      require('@offgrid/application') as typeof import('@offgrid/application');
    const outcome = await applicationFixture.application.models.load({
      modality: 'text',
      modelId: applicationFixture.selectedModelId('text'),
    });
    if (!outcome.ok) {
      throw new Error(
        `Model load failed: ${outcome.failure.kind}: ${modelsFailureMessage(
          outcome.failure,
        )}`,
      );
    }
    await applicationFixture.refreshModels();
  }

  // Stop any generation this suite leaves in flight, on THIS module graph, before the next suite resets
  // modules. Registered the same way requireRTL registers its unmount (a global jest.setup's afterEach
  // calls), because jest.setup must not require these modules itself - doing so would instantiate them in
  // the hundred suites that never touch generation. Without it, a suite that ends mid-reply leaves a 50ms
  // token-flush timer that fires inside the NEXT suite and fails it, which is why exactly one rendered
  // suite failed per run with a different name every time.
  {
    const {
      mobileChatSession,
    } = require('../../src/screens/ChatScreen/mobileChatSession');
    (
      globalThis as unknown as { __GEN_CLEANUP__?: () => Promise<void> }
    ).__GEN_CLEANUP__ = async () => {
      mobileChatSession.stop();
      await applicationFixture.dispose();
      global.XMLHttpRequest = originalXHR;
      global.fetch = originalFetch;
      ActionSheetIOS.showActionSheetWithOptions = originalShowActionSheet;
    };
  }

  routeHolder.params = {}; // new chat — the first send() creates the conversation

  let releaseRemoteStream: (() => void) | null = null;
  const remoteSse = (content: string, reasoning?: string) =>
    `${
      reasoning
        ? `data: ${JSON.stringify({
            choices: [{ delta: { reasoning_content: reasoning } }],
          })}\n\n`
        : ''
    }` +
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n` +
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
    'data: [DONE]\n\n';
  const scriptTextTurn = (scripted: ChatTextScript) => {
    if (opts.engine === 'llama') {
      boundary.llama!.scriptCompletion(scripted);
      return;
    }
    if (opts.engine === 'remote') {
      const { installRemoteStream } =
        require('./remoteHarness') as typeof import('./remoteHarness');
      const content = scripted.content ?? scripted.text ?? '';
      let body: string;
      if (scripted.throwMessage) {
        body = `data: ${JSON.stringify({
          error: { message: scripted.throwMessage },
        })}\n\n`;
      } else if (scripted.holdBeforeStream) {
        body = `__PAUSE__\n${remoteSse(content, scripted.reasoning)}`;
      } else if (scripted.pauseAfter !== undefined) {
        const split = content.indexOf(scripted.pauseAfter);
        const partialEnd =
          split < 0 ? content.length : split + scripted.pauseAfter.length;
        body = remoteSse(content.slice(0, partialEnd)).replace(
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          `__PAUSE__\ndata: ${JSON.stringify({
            choices: [{ delta: { content: content.slice(partialEnd) } }],
          })}\n\n`,
        );
      } else {
        body = remoteSse(content, scripted.reasoning);
      }
      releaseRemoteStream = installRemoteStream(requestBody => {
        if (!scripted.thinkingText) return body;
        let thinkingRequested = false;
        try {
          const request = JSON.parse(requestBody) as {
            chat_template_kwargs?: { enable_thinking?: boolean };
            think?: boolean;
          };
          thinkingRequested =
            request.chat_template_kwargs?.enable_thinking === true ||
            request.think === true;
        } catch {
          /* malformed input stays on the clean scripted path */
        }
        return thinkingRequested ? remoteSse(scripted.thinkingText) : body;
      }).release;
      return;
    }
    if (scripted.throwMessage) {
      boundary.litert.scriptError(scripted.throwMessage);
      return;
    }
    if (opts.engine === 'none') {
      throw new Error('This scenario has no text model to script.');
    }
    if (scripted.holdBeforeStream) {
      boundary.litert.scriptHang();
      return;
    }
    const content = scripted.content ?? scripted.text ?? '';
    if (scripted.pauseAfter !== undefined) {
      const split = content.indexOf(scripted.pauseAfter);
      const partialEnd =
        split < 0 ? content.length : split + scripted.pauseAfter.length;
      boundary.litert.scriptPartialThenPause(
        content.slice(0, partialEnd),
        content.slice(partialEnd),
      );
      return;
    }
    boundary.litert.scriptTurn({
      content,
      reasoning: scripted.reasoning,
      thinkingContent: scripted.thinkingText,
      toolCalls: scripted.toolCalls,
    });
  };

  return {
    boundary,
    React,
    rtl,
    useAppStore,
    useChatStore,
    scriptTextTurn,
    scriptImageTurnFor(
      scenario: ChatScenario,
      scripted: { enhancedPrompt: string; thinkingText: string },
    ) {
      if (scenario.engine === 'none') return;
      scriptTextTurn({
        text: scripted.enhancedPrompt,
        thinkingText: scripted.thinkingText,
      });
    },
    releaseTextStream() {
      if (opts.engine === 'llama') boundary.llama!.releaseStream();
      else if (opts.engine === 'litert') boundary.litert.releaseStream();
      else if (opts.engine === 'remote') releaseRemoteStream?.();
    },
    /** The active conversation id — a NEW chat has none until the first send() creates it. */
    get conversationId(): string | null {
      return useChatStore.getState().activeConversationId;
    },
    view: null as ReturnType<typeof rtl.render> | null,

    /**
     * Arrive-via-UI: enable a built-in tool the way the user does — navigate to the Tools tab (a real
     * separate screen) and flip its switch. Shares the same store as ChatScreen, so the enablement is
     * live when we return to chat. NOT settings.updateSettings seeding.
     */
    enableToolViaUI(toolId: string, value: boolean = true) {
      const { ToolsScreen } = require('../../src/screens/ToolsScreen');
      const { Switch } = require('react-native');

      const tools = rtl.render(React.createElement(ToolsScreen, {}));
      const row = tools.getByTestId(`tool-picker-row-${toolId}`);
      // The RN Switch toggles via onValueChange (not press) — locate it in the row and flip it.
      rtl.fireEvent(
        rtl.within(row).UNSAFE_getByType(Switch),
        'valueChange',
        value,
      );
      tools.unmount();
    },

    /**
     * Arrive-via-UI: set a text-generation SliderSetting (e.g. liteRTTemperature, liteRTTopP) by tapping its
     * value into the real numeric input on the real TextGenerationSection — NOT updateSettings seeding.
     */
    setTextSettingViaUI(key: string, value: number) {
      const {
        TextGenerationSection,
      } = require('../../src/components/GenerationSettingsModal/TextGenerationSection');
      const s = rtl.render(React.createElement(TextGenerationSection, {}));
      rtl.fireEvent.press(s.getByTestId(`setting-${key}-value-button`));
      const input = s.getByTestId(`setting-${key}-input`);
      rtl.fireEvent.changeText(input, String(value));
      rtl.fireEvent(input, 'submitEditing');
      s.unmount();
    },

    /** Let async work (tool loop → tool-result bubble render) settle before asserting. */
    async settle(ms = 300) {
      await new Promise(r => setTimeout(r, ms));
    },

    /**
     * Tap the real quick-image-mode toggle once (opens the quick-settings popover, taps the image-mode row).
     * Cycles auto → ON(force) → OFF(disabled) → auto. Requires an image model (the toggle refuses without
     * one, alerting "No Image Model").
     */
    async cycleImageMode() {
      const view = this.view!;
      rtl.fireEvent.press(
        await rtl.waitFor(() => view.getByTestId('quick-settings-button')),
      );
      rtl.fireEvent.press(
        await rtl.waitFor(() => view.getByTestId('quick-image-mode')),
      );
    },

    /**
     * Import an image-model archive through the real Mobile adapter and Shared transaction. The harness
     * controls only the picked archive, extracted files, and native unzip boundary; registry, selection,
     * refresh, and application projection remain production behavior.
     */
    async placeImageModel(
      imgOpts: {
        id?: string;
        modelPath?: string;
        backend?: 'mnn' | 'qnn' | 'coreml';
        size?: number;
      } = {},
    ) {
      return placeLocalImageModel(imgOpts);
    },

    /** Place the image route declared by the scenario. Tests never map an OS to a backend. */
    async placeImageModelFor(scenario: ChatScenario) {
      if (!scenario.imageBackend) {
        throw new Error(`${scenario.label} does not declare an image backend.`);
      }
      if (scenario.imageBackend === 'remote') {
        if (scenarioImagePlaced) return null;
        scenarioImagePlaced = true;
        return placeRemoteImageModel();
      }
      if (scenarioImagePlaced) return null;
      scenarioImagePlaced = true;
      return placeLocalImageModel({ backend: scenario.imageBackend });
    },

    /** Set the visible in-chat Thinking choice through the real quick-settings control. */
    async setThinkingEnabledViaUI(enabled: boolean) {
      const view = this.view!;
      rtl.fireEvent.press(
        await rtl.waitFor(() => view.getByTestId('quick-settings-button')),
      );
      const toggle = await rtl.waitFor(() =>
        view.getByTestId('quick-thinking-toggle'),
      );
      const readsEnabled = () => Boolean(rtl.within(toggle).queryByText('ON'));
      if (readsEnabled() !== enabled) rtl.fireEvent.press(toggle);
      await rtl.waitFor(() => expect(readsEnabled()).toBe(enabled));
      const { Modal } =
        require('react-native') as typeof import('react-native');
      const modal = view
        .UNSAFE_getAllByType(Modal)
        .find(candidate =>
          rtl.within(candidate).queryByTestId('quick-thinking-toggle'),
        );
      if (!modal) throw new Error('The quick-settings menu is not open.');
      rtl.fireEvent(modal, 'requestClose');
      await rtl.waitFor(() => {
        expect(view.queryByTestId('quick-thinking-toggle')).toBeNull();
      });
    },

    /** Set prompt enhancement through the real Chat Settings sheet. */
    async setImageEnhancementEnabledViaUI(enabled: boolean) {
      const view = this.view!;
      rtl.fireEvent.press(view.getByTestId('chat-settings-icon'));
      rtl.fireEvent.press(
        await rtl.waitFor(() => view.getByTestId('modal-image-accordion')),
      );
      rtl.fireEvent.press(
        await rtl.waitFor(() =>
          view.getByTestId(enabled ? 'image-enhance-on' : 'image-enhance-off'),
        ),
      );
      const enabledDescription =
        'Text model refines your prompt before image generation (slower but better results)';
      const disabledDescription =
        opts.engine === 'none'
          ? 'Download a text model to enable prompt enhancement'
          : 'Use your prompt directly for image generation (faster)';
      await rtl.waitFor(() => {
        expect(
          view.getByText(enabled ? enabledDescription : disabledDescription),
        ).toBeVisible();
      });
      const { Modal } =
        require('react-native') as typeof import('react-native');
      const modal = view
        .UNSAFE_getAllByType(Modal)
        .find(candidate => rtl.within(candidate).queryByText('Chat Settings'));
      if (!modal) throw new Error('The Chat Settings sheet is not open.');
      rtl.fireEvent(modal, 'requestClose');
      await rtl.waitFor(() => {
        expect(view.queryByText('Chat Settings')).toBeNull();
      });
    },

    /**
     * The whole image-generation journey, through real gestures: place a downloaded image model, force image
     * mode ON via the real toggle, and send a prompt.
     *
     * ONE definition of this journey. Two suites had grown near-identical private copies (imageLightbox's
     * `generateImage` and an in-flight variant), differing only in whether they wait for the finished image -
     * which is exactly how a third copy gets written with a subtly different idea of what "generated" means.
     *
     * `hold: true` parks the generation INSIDE native generateImage and returns while it is still in flight, so
     * a test can exercise what the user can do during the many seconds diffusion really takes (press STOP,
     * watch progress move, tap send again). Release it with `boundary.diffusion.releaseGeneration()` - or by
     * cancelling, which is what native does.
     */
    async generateImageViaUI(
      imgOpts: {
        prompt?: string;
        backend?: 'mnn' | 'qnn' | 'coreml';
        hold?: boolean;
      } = {},
    ) {
      const {
        prompt = 'a fox in the snow',
        backend = 'coreml',
        hold = false,
      } = imgOpts;
      if (!this.view) this.render();
      await this.placeImageModel({ backend });
      await this.cycleImageMode(); // auto -> ON(force); also activates the downloaded image model
      await rtl.waitFor(() => {
        expect(
          this.view!.queryByTestId('image-mode-force-badge'),
        ).not.toBeNull();
      });

      if (hold) boundary.diffusion.holdNextGeneration();
      await this.tapSend(prompt);
      // Native has been entered either way; only the waiting differs.
      await rtl.waitFor(() => {
        expect(boundary.diffusion.calls.generateImage.length).toBe(1);
      });
      if (hold) {
        await rtl.waitFor(() => {
          expect(boundary.diffusion.generationHeld()).toBe(true);
        });
        return;
      }
      await rtl.waitFor(() => {
        expect(this.view!.queryByTestId('generated-image')).not.toBeNull();
      });
    },

    /**
     * Press the stop control on the image progress card.
     *
     * That control has NO testID (ChatScreenComponents: a bare TouchableOpacity around an "x" icon), so it is
     * reached structurally - the pressable ancestor of the card's "x". The count is asserted first, so if a
     * second "x" control ever shares the screen this fails loudly instead of quietly pressing the wrong thing.
     * A testID on that control would delete this helper.
     */
    async pressImageCardStop() {
      type PressNode = {
        type?: unknown;
        props?: Record<string, unknown>;
        parent?: PressNode | null;
      };
      await rtl.act(async () => {
        const xIcons = this.view!.root.findAll(
          (n: PressNode) =>
            n.type === 'Icon' && (n.props as { name?: string })?.name === 'x',
        );
        expect(xIcons).toHaveLength(1);
        let node: PressNode | null = xIcons[0] as unknown as PressNode;
        for (let depth = 0; node && depth < 12; depth++) {
          const onPress = node.props?.onPress;
          if (typeof onPress === 'function') {
            (onPress as () => void)();
            return;
          }
          node = node.parent ?? null;
        }
        throw new Error(
          'the image progress card\'s "x" has no pressable ancestor - the stop control is dead',
        );
      });
    },

    /**
     * Gesture-only send: type into the real input + press the real send button, WITHOUT scripting a turn.
     * Use when the test scripts multi-turn native output itself (e.g. boundary.litert.scriptTurns([...]) for
     * a two-pass router). The gesture is identical to send() — only the scripting differs.
     */
    async tapSend(text: string) {
      const view = this.view!;
      const input = await rtl.waitFor(() => view.getByTestId('chat-input'));
      // Drive the composer's REAL onChangeText handler (the same one a keypress invokes). We do NOT use
      // fireEvent.changeText here because once a whisper/STT model is present it silently no-ops on this
      // TextInput (a real ChatInput coupling: the composer subtree reshapes with voice availability), which
      // would leave the send button unrendered. Invoking the bound handler is faithful and robust either way.
      await rtl.act(async () => {
        (
          input as unknown as { props: { onChangeText: (t: string) => void } }
        ).props.onChangeText(text);
      });
      // waitFor the send button (it appears once the text lands), then invoke its TouchableOpacity onPress.
      // We resolve the handler off the node instead of rtl.fireEvent.press because, once a whisper/STT model
      // is present, RTL's press traversal does not reach this button's onPress (the composer subtree reshapes
      // with voice availability) — invoking the bound handler is the same thing a tap does and is robust.
      await rtl.waitFor(() => view.getByTestId('send-button'));
      type PressNode = {
        props?: Record<string, unknown>;
        parent?: PressNode | null;
      } | null;
      const pressSend = () => {
        let n: PressNode = view.getByTestId(
          'send-button',
        ) as unknown as PressNode;
        for (let d = 0; n && d < 12; d++) {
          const op = n.props?.onPress;
          if (typeof op === 'function') {
            (op as () => void)();
            return;
          }
          n = n.parent ?? null;
        }
        rtl.fireEvent.press(view.getByTestId('send-button')); // fallback
      };
      await rtl.act(async () => {
        pressSend();
      });
    },

    /**
     * REAL attach-photo gesture: open the attach popover, tap "Photo" — the (faked) native image picker
     * returns an image, which the real useAttachments hook adds as a pending attachment. Requires a
     * vision-capable model (setupChatScreen({vision:true})), else the app alerts instead of attaching.
     */
    async attachImageViaUI(source: 'library' | 'camera' = 'library') {
      const view = this.view!;
      if (platform === 'ios') {
        actionSheetSelections.push(0, source === 'camera' ? 0 : 1);
      }
      rtl.fireEvent.press(
        await rtl.waitFor(() => view.getByTestId('attach-button')),
      );
      if (platform === 'android') {
        rtl.fireEvent.press(
          await rtl.waitFor(() => view.getByTestId('attach-photo')),
        );
        // Android renders the source choice in the application alert. iOS uses the native action-sheet
        // boundary scripted above. Both then run the same real picker and attachment path.
        rtl.fireEvent.press(
          await rtl.waitFor(() =>
            view.getByText(source === 'camera' ? 'Camera' : 'Photo Library'),
          ),
        );
        await this.settle(400); // the Android handler waits for its alert to close before opening native UI.
      }
      await rtl.waitFor(() => {
        expect(view.queryByTestId('attachments-container')).not.toBeNull();
      });
    },

    /** Attach a document through the real attach popover and native picker boundary. */
    async attachDocumentViaUI() {
      const view = this.view!;
      if (platform === 'ios') {
        const supportsVision = opts.vision || opts.engine === 'remote';
        actionSheetSelections.push(supportsVision ? 1 : 0);
      }
      rtl.fireEvent.press(
        await rtl.waitFor(() => view.getByTestId('attach-button')),
      );
      if (platform === 'android') {
        rtl.fireEvent.press(
          await rtl.waitFor(() => view.getByTestId('attach-document')),
        );
      }
      await rtl.waitFor(() => {
        expect(view.queryByText('document.txt')).not.toBeNull();
      });
    },

    /**
     * Arrive-via-UI: turn on "Show Generation Details" by tapping its real segmented control (the same
     * control the settings screen renders). Needed to see the per-message details (model, tok/s, tools
     * sent). NOT settings.updateSettings seeding.
     */
    enableGenerationDetailsViaUI() {
      const {
        ShowGenerationDetailsToggle,
      } = require('../../src/components/settings/textGenAdvancedSections');
      const s = rtl.render(
        React.createElement(ShowGenerationDetailsToggle, {}),
      );
      rtl.fireEvent.press(s.getByTestId('show-gen-details-on-button'));
      s.unmount();
    },

    /**
     * Arrive-via-UI at "the user has a downloaded + selected STT model" (chat-mode voice precondition).
     * Boundary leaf: the whisper file on disk (a download's artifact). Then run the REAL disk scan
     * (refreshPresentModels) so the model shows as present, and TAP the present card on the real
     * TranscriptionModelsTab → the real selectModel sets it active + loads it resident. Requires whisper:true.
     */
    async setupWhisperModel(modelId = 'tiny.en') {
      const {
        TranscriptionModelsTab,
      } = require('../../src/screens/ModelsScreen/TranscriptionModelsTab');
      const { createTranscriptionModelsSelector } =
        require('@offgrid/application') as typeof import('@offgrid/application');
      const { refreshTranscriptionModels } =
        require('../../src/services/transcriptionModelApplication') as typeof import('../../src/services/transcriptionModelApplication');
      const selectTranscriptionModels = createTranscriptionModelsSelector();

      boundary.fs!.seedFile(
        `${docs}/whisper-models/ggml-${modelId}.bin`,
        75 * 1024 * 1024,
      );
      const refreshed = await refreshTranscriptionModels();
      expect(refreshed.ok).toBe(true); // real disk scan → Shared inventory projection
      const t = rtl.render(React.createElement(TranscriptionModelsTab, {}));
      await rtl.waitFor(
        () => {
          const row = selectTranscriptionModels(
            applicationFixture.application.models.snapshot(),
          ).models.find(candidate => candidate.catalog.id === modelId);
          expect(row?.installed).toBe(true);
        },
        { timeout: 4000 },
      );
      rtl.fireEvent.press(
        await rtl.waitFor(() => t.getByTestId('transcription-model-card-0')),
      );
      await rtl.waitFor(
        () => {
          expect(
            selectTranscriptionModels(
              applicationFixture.application.models.snapshot(),
            ).selectedModelId,
          ).toBe(modelId);
        },
        { timeout: 4000 },
      );
      t.unmount();
    },

    /** Acquire the selected Whisper runtime through the same residency intent used by microphone demand. */
    async loadSelectedWhisperOnDemand(modelId = 'tiny.en') {
      const {
        mobileResidencyIntents,
      } = require('../../src/services/modelServices/residencyIntents');
      const result = await mobileResidencyIntents.ensureTranscription(modelId);
      expect(result).toBe('loaded');
    },

    /** Start a real chat-mode mic gesture. Tests can release it as a hold or keep it pressed. */
    async tapMic() {
      const view = this.view!;
      const btn = await rtl.waitFor(() =>
        view.getByTestId('voice-record-button'),
      );
      // PanResponder wires onResponderGrant → onPanResponderGrant(evt, gestureState); RNTL fireEvent invokes
      // the prop directly, so pass a synthetic event carrying a valid touchHistory (PanResponder reads it to
      // build gestureState). indexOfSingleActiveTouch:-1 = no active bank entry (a fresh grant).
      const evt = {
        nativeEvent: {
          touches: [],
          changedTouches: [],
          identifier: 1,
          pageX: 0,
          pageY: 0,
          timestamp: 0,
        },
        touchHistory: {
          touchBank: [],
          numberActiveTouches: 0,
          indexOfSingleActiveTouch: -1,
          mostRecentTimeStamp: 0,
        },
      };
      rtl.fireEvent(btn, 'responderGrant', evt);
    },

    /** One short tap: start recording and lock it until the next tap. */
    async tapMicOnce() {
      const view = this.view!;
      const btn = await rtl.waitFor(() =>
        view.getByTestId('voice-record-button'),
      );
      const grant = {
        nativeEvent: {
          touches: [],
          changedTouches: [],
          identifier: 1,
          pageX: 0,
          pageY: 0,
          timestamp: 0,
        },
        touchHistory: {
          touchBank: [],
          numberActiveTouches: 0,
          indexOfSingleActiveTouch: -1,
          mostRecentTimeStamp: 0,
        },
      };
      const release = {
        ...grant,
        nativeEvent: { ...grant.nativeEvent, timestamp: 100 },
      };
      rtl.fireEvent(btn, 'responderGrant', grant);
      rtl.fireEvent(btn, 'responderRelease', release);
    },

    /** Release after a long press, which stops the recording. */
    async releaseMic() {
      const view = this.view!;
      const btn = await rtl.waitFor(() =>
        view.getByTestId('voice-record-button'),
      );
      const evt = {
        nativeEvent: {
          touches: [],
          changedTouches: [],
          identifier: 1,
          pageX: 0,
          pageY: 0,
          timestamp: 500,
        },
        touchHistory: {
          touchBank: [],
          numberActiveTouches: 0,
          indexOfSingleActiveTouch: -1,
          mostRecentTimeStamp: 500,
        },
      };
      rtl.fireEvent(btn, 'responderRelease', evt);
    },

    /**
     * Reusable VOICE-MODE (audio interface) entry. Enter voice mode the way a user does: tap the header
     * Text/Voice dropdown and choose Voice. Pre-places ONLY the boundary leaf a completed voice-model
     * download leaves (the persisted modelDownloaded flag) — downloading is native and can't be gestured;
     * the mode-switch gesture runs for real. Requires pro:true + whisper:true. Waits for the audio-mode
     * record button to render. Reused by every voice/TTS flow test.
     */
    async enterVoiceMode() {
      const view = this.view!;

      const { useTTSStore } = require('@offgrid/pro/audio/ttsStore');
      const engineId = useTTSStore.getState().settings.engineId;
      // BOUNDARY: the persisted artifact a completed voice-model download leaves — drives shouldLoad in the
      // REAL KokoroTTSBridge. Set via the real store action (like the LLM's @local_llm/downloaded_models
      // record). NOT a phase/isReady poke: readiness below is EMERGENT from the real engine + executorch fake.
      await useTTSStore.getState().updateSettings({
        modelDownloaded: {
          ...(useTTSStore.getState().settings.modelDownloaded ?? {}),
          [engineId]: true,
        },
      });
      // GESTURE: open the chat-input quick-settings popover and tap the Voice row (the alternate real entry
      // to voice mode, per the header dropdown). This intent owns on-demand engine
      // initialization; the harness must not wait for eager readiness first.
      rtl.fireEvent.press(
        await rtl.waitFor(() => view.getByTestId('quick-settings-button')),
      );
      rtl.fireEvent.press(
        await rtl.waitFor(() => view.getByTestId('quick-tts-mode')),
      );
      await rtl.waitFor(
        () => {
          expect(view.getByTestId('voice-record-button-audio')).toBeTruthy();
        },
        { timeout: 4000 },
      );
    },

    /**
     * Voice-send a message in audio mode: the (faked) whisper model transcribes the recorded audio file to
     * `transcript`, then the REAL audio record button is tapped to START and tapped again to STOP & SEND —
     * driving the real transcribeFile → onTranscript → send path (the working voice-mode STT pipeline). Pass
     * `scripted` for a text reply; omit it for an image request (the diffusion boundary renders the image).
     */
    async voiceSend(
      transcript: string,
      scripted?: {
        text?: string;
        content?: string;
        toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
      },
    ) {
      const view = this.view!;
      if (scripted) {
        if (opts.engine === 'llama')
          boundary.llama!.scriptCompletion(scripted as { text?: string });
        else
          boundary.litert.scriptTurn(
            scripted as {
              content?: string;
              toolCalls?: Array<{
                name: string;
                arguments: Record<string, unknown>;
              }>;
            },
          );
      }
      // BOUNDARY: the whisper model transcribes the recorded audio file to this text.
      boundary.whisper!.setFileTranscript(transcript);
      const btn = () => view.getByTestId('voice-record-button-audio');
      rtl.fireEvent.press(await rtl.waitFor(btn)); // tap: start recording
      await this.settle(50);
      rtl.fireEvent.press(await rtl.waitFor(btn)); // tap: stop & send → transcribeFile → onTranscript → send
    },

    /** Mount the real ChatScreen (plus the real app.root slot when pro is active, so the TTS EngineBridge
     *  mounts and the voice engine can load over the executorch fake — the same slot App.tsx renders). */
    render() {
      const { ChatScreen } = require('../../src/screens/ChatScreen');
      const { getSlot, SLOTS } = require('../../src/bootstrap/slotRegistry');

      const AppRoot = opts.pro ? getSlot(SLOTS.appRoot) : undefined;
      const tree = AppRoot
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement(AppRoot, {}),
            React.createElement(ChatScreen, {}),
          )
        : React.createElement(ChatScreen, {});
      this.view = rtl.render(tree);
      return this.view;
    },

    /**
     * Script the next engine turn, then drive the real user send: type into the real input, press the real
     * send button, and await the assistant reply rendering. `scripted` is what the (faked) native engine
     * returns — the real generation pipeline turns it into the rendered bubble.
     */
    async send(text: string, scripted: ChatTextScript) {
      scriptTextTurn(scripted);

      const view = this.view!;
      const input = await rtl.waitFor(() => view.getByTestId('chat-input'));
      // Drive the composer's REAL onChangeText handler (the same one a keypress invokes). We do NOT use
      // fireEvent.changeText here because once a whisper/STT model is present it silently no-ops on this
      // TextInput (a real ChatInput coupling: the composer subtree reshapes with voice availability), which
      // would leave the send button unrendered. Invoking the bound handler is faithful and robust either way.
      await rtl.act(async () => {
        (
          input as unknown as { props: { onChangeText: (t: string) => void } }
        ).props.onChangeText(text);
      });
      // waitFor the send button (it appears once the text lands), then invoke its TouchableOpacity onPress.
      // We resolve the handler off the node instead of rtl.fireEvent.press because, once a whisper/STT model
      // is present, RTL's press traversal does not reach this button's onPress (the composer subtree reshapes
      // with voice availability) — invoking the bound handler is the same thing a tap does and is robust.
      await rtl.waitFor(() => view.getByTestId('send-button'));
      type PressNode = {
        props?: Record<string, unknown>;
        parent?: PressNode | null;
      } | null;
      const pressSend = () => {
        let n: PressNode = view.getByTestId(
          'send-button',
        ) as unknown as PressNode;
        for (let d = 0; n && d < 12; d++) {
          const op = n.props?.onPress;
          if (typeof op === 'function') {
            (op as () => void)();
            return;
          }
          n = n.parent ?? null;
        }
        rtl.fireEvent.press(view.getByTestId('send-button')); // fallback
      };
      await rtl.act(async () => {
        pressSend();
      });
    },

    /**
     * Open the REAL action menu for the last message of `role`, via the requested affordance:
     *  - 'longpress' → long-press the message bubble
     *  - 'dots'      → tap the 3-dots '•••' button in the message meta row
     * BOTH are real user entry points and must both be exercised (they wire the same setShowActionMenu).
     */
    async openActionMenu(
      role: 'user' | 'assistant',
      via: 'longpress' | 'dots',
    ) {
      const view = this.view!;
      const testId = role === 'user' ? 'user-message' : 'assistant-message';
      const bubbles = await rtl.waitFor(() => {
        const b = view.queryAllByTestId(testId);
        expect(b.length).toBeGreaterThan(0);
        return b;
      });
      const target = bubbles[bubbles.length - 1];
      if (via === 'longpress') {
        rtl.fireEvent(target, 'longPress');
      } else {
        // The 3-dots '•••' lives inside THIS message's element — scope to it (not the global-last dots,
        // which would be a different message's button).
        const dots = await rtl.waitFor(() =>
          rtl.within(target).getByText('•••'),
        );
        rtl.fireEvent.press(dots);
      }
      await rtl.waitFor(() => {
        expect(view.getByTestId('action-menu')).toBeTruthy();
      });
    },

    /**
     * REAL regenerate gesture: open the action menu (via long-press OR 3-dots) and press "Retry".
     */
    async regenerateLast(
      scripted: ChatTextScript,
      via: 'longpress' | 'dots' = 'longpress',
    ) {
      scriptTextTurn(scripted);
      await this.openActionMenu('assistant', via);
      rtl.fireEvent.press(this.view!.getByTestId('action-retry'));
    },

    /**
     * REAL edit gesture: open the action menu (via long-press OR 3-dots) → "Edit" → change text →
     * "SAVE & RESEND". The real edit handler rewrites history and re-runs generation.
     */
    async editLastUserMessage(
      newText: string,
      scripted: ChatTextScript,
      via: 'longpress' | 'dots' = 'longpress',
    ) {
      scriptTextTurn(scripted);
      await this.openActionMenu('user', via);
      const view = this.view!;
      rtl.fireEvent.press(view.getByTestId('action-edit'));
      const input = await rtl.waitFor(() =>
        view.getByPlaceholderText('Enter message...'),
      );
      rtl.fireEvent.changeText(input, newText);
      rtl.fireEvent.press(view.getByText('SAVE & RESEND'));
    },
  };
}

/**
 * Start the real Chat screen and apply every declared scenario state through public UI actions.
 * Boundary-only model and file fixtures remain inside setupChatScreen.
 */
export async function startChatScreen(scenario: ChatScenario) {
  const h = await setupChatScreen(scenario);
  if (scenario.modality === 'voice') await h.setupWhisperModel();
  if (scenario.tools?.includes('built-in')) {
    const { AVAILABLE_TOOLS } =
      require('../../src/services/tools') as typeof import('../../src/services/tools');
    for (const tool of AVAILABLE_TOOLS) h.enableToolViaUI(tool.id);
  }
  if (scenario.tools?.some(tool => tool !== 'built-in')) {
    throw new Error(
      `${scenario.label} requires a Pro, remote, or MCP tool boundary that has not been declared.`,
    );
  }

  h.render();
  if (scenario.imageBackend) await h.placeImageModelFor(scenario);
  if (scenario.thinkingEnabled !== undefined) {
    await h.setThinkingEnabledViaUI(scenario.thinkingEnabled);
  }
  if (scenario.imageEnhancementEnabled !== undefined) {
    await h.setImageEnhancementEnabledViaUI(scenario.imageEnhancementEnabled);
  }
  if (scenario.modality === 'voice') await h.enterVoiceMode();
  if (scenario.photoSource) {
    await h.attachImageViaUI(
      scenario.photoSource === 'gallery' ? 'library' : 'camera',
    );
  }
  if (scenario.documentAttached) await h.attachDocumentViaUI();
  return h;
}
