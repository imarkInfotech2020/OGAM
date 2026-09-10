import type { RamProfile } from './nativeBoundary';

export type ChatPlatform = 'ios' | 'android';
export type ChatEngine = 'llama' | 'litert' | 'remote' | 'none';
export type ChatModality = 'text' | 'voice';
export type ChatToolSource = 'built-in' | 'pro' | 'remote' | 'mcp' | 'all';
export type ChatPhotoSource = 'camera' | 'gallery';
export type ChatImageBackend = 'mnn' | 'qnn' | 'coreml' | 'remote';

export interface ChatScenarioOptions {
  platform?: ChatPlatform;
  ram?: RamProfile;
  vision?: boolean;
  audio?: boolean;
  whisper?: boolean;
  download?: boolean;
  pro?: boolean;
  deferInitialLoad?: boolean;
  modelName?: string;
  modelFileName?: string;
  modelFileSizeBytes?: number;
  chatTemplate?: string;
}

type ChatScenarioState = ChatScenarioOptions & {
  engine: ChatEngine;
  imageBackend?: ChatImageBackend;
  thinkingEnabled?: boolean;
  imageEnhancementEnabled?: boolean;
  modality?: ChatModality;
  tools?: readonly ChatToolSource[];
  photoSource?: ChatPhotoSource;
  documentAttached?: boolean;
};

const engineLabel: Record<ChatEngine, string> = {
  llama: 'Llama',
  litert: 'LiteRT',
  remote: 'remote text',
  none: 'no text model',
};

export function getBackendForPlatform(
  platform: ChatPlatform,
  modality: 'image',
): Exclude<ChatImageBackend, 'qnn' | 'remote'> {
  return platform === 'ios' ? 'coreml' : 'mnn';
}

/** Immutable, executable setup for one rendered Chat-screen journey. */
export class ChatScenario {
  readonly label: string;
  readonly engine: ChatEngine;
  readonly platform: ChatPlatform;
  readonly ram?: RamProfile;
  readonly vision?: boolean;
  readonly audio?: boolean;
  readonly whisper?: boolean;
  readonly download?: boolean;
  readonly pro?: boolean;
  readonly deferInitialLoad?: boolean;
  readonly modelName?: string;
  readonly modelFileName?: string;
  readonly modelFileSizeBytes?: number;
  readonly chatTemplate?: string;
  readonly imageBackend?: ChatImageBackend;
  readonly thinkingEnabled?: boolean;
  readonly imageEnhancementEnabled?: boolean;
  readonly modality?: ChatModality;
  readonly tools?: readonly ChatToolSource[];
  readonly photoSource?: ChatPhotoSource;
  readonly documentAttached?: boolean;

  constructor(state: ChatScenarioState) {
    this.engine = state.engine;
    this.platform = state.platform ?? 'android';
    this.ram = state.ram;
    this.vision = state.vision;
    this.audio = state.audio;
    this.whisper = state.whisper;
    this.download = state.download;
    this.pro = state.pro;
    this.deferInitialLoad = state.deferInitialLoad;
    this.modelName = state.modelName;
    this.modelFileName = state.modelFileName;
    this.modelFileSizeBytes = state.modelFileSizeBytes;
    this.chatTemplate = state.chatTemplate;
    this.imageBackend = state.imageBackend;
    this.thinkingEnabled = state.thinkingEnabled;
    this.imageEnhancementEnabled = state.imageEnhancementEnabled;
    this.modality = state.modality;
    this.tools = state.tools;
    this.photoSource = state.photoSource;
    this.documentAttached = state.documentAttached;
    const parts = [this.platform, engineLabel[this.engine]];
    if (this.imageBackend) parts.push(`${this.imageBackend} image`);
    if (this.imageEnhancementEnabled !== undefined) {
      parts.push(
        `image enhancement ${this.imageEnhancementEnabled ? 'ON' : 'OFF'}`,
      );
    }
    if (this.thinkingEnabled !== undefined) {
      parts.push(`Thinking ${this.thinkingEnabled ? 'ON' : 'OFF'}`);
    }
    this.label = parts.join(' + ');
  }

  private copy(patch: Partial<ChatScenarioState>): ChatScenario {
    return new ChatScenario({ ...this, ...patch });
  }

  usingBackend(
    modality: 'image',
    backend: ChatImageBackend = getBackendForPlatform(this.platform, modality),
  ): ChatScenario {
    return this.copy({ imageBackend: backend });
  }

  usingRemoteImage(): ChatScenario {
    return this.usingBackend('image', 'remote');
  }

  inChatThinkingEnabled(): ChatScenario {
    return this.copy({ thinkingEnabled: true });
  }

  inChatThinkingDisabled(): ChatScenario {
    return this.copy({ thinkingEnabled: false });
  }

  inChatImageEnhancementEnabled(): ChatScenario {
    return this.copy({ imageEnhancementEnabled: true });
  }

  inChatImageEnhancementDisabled(): ChatScenario {
    return this.copy({ imageEnhancementEnabled: false });
  }

  withChatModality(modality: ChatModality): ChatScenario {
    return this.copy({
      modality,
      pro: modality === 'voice' ? true : this.pro,
      whisper: modality === 'voice' ? true : this.whisper,
    });
  }

  withTools(...tools: readonly ChatToolSource[]): ChatScenario {
    return this.copy({
      tools,
      pro: tools.some(tool => tool !== 'built-in') || this.pro,
    });
  }

  withPhotoAttachment(source: ChatPhotoSource): ChatScenario {
    return this.copy({ photoSource: source, vision: true });
  }

  withDocumentAttachment(): ChatScenario {
    return this.copy({ documentAttached: true });
  }

  expectsEnhancedImagePrompt(): boolean {
    return (
      this.imageBackend !== 'remote' &&
      this.imageEnhancementEnabled === true &&
      this.engine !== 'none'
    );
  }
}

export function usingEngine(
  engine: ChatEngine,
  options: ChatScenarioOptions = {},
): ChatScenario {
  return new ChatScenario({ ...options, engine });
}

export const usingLlama = (options: ChatScenarioOptions = {}): ChatScenario =>
  usingEngine('llama', options);

export const usingLiteRT = (options: ChatScenarioOptions = {}): ChatScenario =>
  usingEngine('litert', options);

export const usingRemoteText = (
  options: ChatScenarioOptions = {},
): ChatScenario => usingEngine('remote', options);

export const withoutTextModel = (
  options: ChatScenarioOptions = {},
): ChatScenario => usingEngine('none', options);

export const CHAT_LOCAL_TEXT_SCENARIOS = [
  usingLlama({ platform: 'ios' }),
  usingLlama({ platform: 'android' }),
  usingLiteRT({ platform: 'android' }),
] as const;

export const CHAT_TEXT_SCENARIOS = [
  CHAT_LOCAL_TEXT_SCENARIOS[0],
  usingRemoteText({ platform: 'ios' }),
  ...CHAT_LOCAL_TEXT_SCENARIOS.slice(1),
  usingRemoteText({ platform: 'android' }),
] as const;

export const CHAT_THINKING_DISABLED_SCENARIOS = CHAT_TEXT_SCENARIOS.map(
  scenario => scenario.inChatThinkingDisabled(),
);

export const CHAT_LOCAL_IMAGE_SCENARIOS = CHAT_TEXT_SCENARIOS.map(scenario =>
  scenario.usingBackend('image'),
);

export const CHAT_REMOTE_IMAGE_SCENARIOS = CHAT_TEXT_SCENARIOS.map(scenario =>
  scenario.usingRemoteImage(),
);

export const CHAT_IMAGE_SCENARIOS = [
  ...CHAT_LOCAL_IMAGE_SCENARIOS,
  ...CHAT_REMOTE_IMAGE_SCENARIOS,
] as const;

export const CHAT_PHOTO_ATTACHMENT_SCENARIOS = [
  usingRemoteText({ platform: 'ios' }).withPhotoAttachment('camera'),
  usingRemoteText({ platform: 'ios' }).withPhotoAttachment('gallery'),
  usingLiteRT({ platform: 'android' }).withPhotoAttachment('camera'),
  usingLiteRT({ platform: 'android' }).withPhotoAttachment('gallery'),
  usingRemoteText({ platform: 'android' }).withPhotoAttachment('camera'),
  usingRemoteText({ platform: 'android' }).withPhotoAttachment('gallery'),
] as const;

export const CHAT_DOCUMENT_ATTACHMENT_SCENARIOS = CHAT_TEXT_SCENARIOS.map(
  scenario => scenario.withDocumentAttachment(),
);

/** The complete rendered image-send matrix. Every row is executed by the image journey test. */
export const CHAT_IMAGE_GENERATION_SCENARIOS = [
  usingLlama({ platform: 'ios' })
    .usingBackend('image')
    .inChatImageEnhancementEnabled()
    .inChatThinkingEnabled(),
  usingRemoteText({ platform: 'ios' })
    .usingBackend('image')
    .inChatImageEnhancementEnabled()
    .inChatThinkingDisabled(),
  usingLlama({ platform: 'android' })
    .usingBackend('image')
    .inChatImageEnhancementDisabled()
    .inChatThinkingEnabled(),
  usingLiteRT({ platform: 'android' })
    .usingBackend('image')
    .inChatImageEnhancementEnabled()
    .inChatThinkingDisabled(),
  usingRemoteText({ platform: 'android' })
    .usingBackend('image')
    .inChatImageEnhancementDisabled()
    .inChatThinkingEnabled(),
  usingLlama({ platform: 'ios' })
    .usingRemoteImage()
    .inChatImageEnhancementEnabled()
    .inChatThinkingDisabled(),
  usingRemoteText({ platform: 'ios' })
    .usingRemoteImage()
    .inChatImageEnhancementDisabled()
    .inChatThinkingEnabled(),
  usingLlama({ platform: 'android' })
    .usingRemoteImage()
    .inChatImageEnhancementEnabled()
    .inChatThinkingEnabled(),
  usingLiteRT({ platform: 'android' })
    .usingRemoteImage()
    .inChatImageEnhancementDisabled()
    .inChatThinkingDisabled(),
  usingRemoteText({ platform: 'android' })
    .usingRemoteImage()
    .inChatImageEnhancementEnabled()
    .inChatThinkingDisabled(),
  withoutTextModel({ platform: 'ios' })
    .usingBackend('image')
    .inChatImageEnhancementDisabled(),
  withoutTextModel({ platform: 'android' })
    .usingBackend('image')
    .inChatImageEnhancementDisabled(),
  withoutTextModel({ platform: 'ios' })
    .usingRemoteImage()
    .inChatImageEnhancementDisabled(),
  withoutTextModel({ platform: 'android' })
    .usingRemoteImage()
    .inChatImageEnhancementDisabled(),
] as const;

/** One index for the scenario rows that rendered Chat-screen journey tests execute. */
export const CHAT_SCENARIO_MATRIX = {
  text: CHAT_TEXT_SCENARIOS,
  thinkingDisabled: CHAT_THINKING_DISABLED_SCENARIOS,
  localImage: CHAT_LOCAL_IMAGE_SCENARIOS,
  remoteImage: CHAT_REMOTE_IMAGE_SCENARIOS,
  imageGeneration: CHAT_IMAGE_GENERATION_SCENARIOS,
  photoAttachment: CHAT_PHOTO_ATTACHMENT_SCENARIOS,
  documentAttachment: CHAT_DOCUMENT_ATTACHMENT_SCENARIOS,
} as const;
