import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';

const SCREENSHOT_CAPTURED_EVENT = 'SyncScreenshotCaptured';

export interface NativeScreenshot {
  syncId: string;
  name: string;
  mimeType: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  width: number;
  height: number;
}

interface SyncScreenshotNativeModule {
  setEnabled(enabled: boolean): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

function module(): SyncScreenshotNativeModule {
  const nativeModule = NativeModules.SyncScreenshotModule as
    | SyncScreenshotNativeModule
    | undefined;
  if (Platform.OS !== 'ios' || !nativeModule) {
    throw new Error('Automatic screenshot sharing is unavailable.');
  }
  return nativeModule;
}

function parse(value: unknown): NativeScreenshot | null {
  if (!value || typeof value !== 'object') return null;
  const screenshot = value as Partial<NativeScreenshot>;
  return typeof screenshot.syncId === 'string' &&
    typeof screenshot.name === 'string' &&
    typeof screenshot.mimeType === 'string' &&
    typeof screenshot.filePath === 'string' &&
    typeof screenshot.fileSize === 'number' &&
    typeof screenshot.createdAt === 'string' &&
    typeof screenshot.width === 'number' &&
    typeof screenshot.height === 'number'
    ? (screenshot as NativeScreenshot)
    : null;
}

export const nativeScreenshotBoundary = {
  observe(listener: (screenshot: NativeScreenshot) => void): () => void {
    const nativeModule = module();
    const emitter = new NativeEventEmitter(nativeModule);
    const subscription: EmitterSubscription = emitter.addListener(
      SCREENSHOT_CAPTURED_EVENT,
      (value: unknown) => {
        const screenshot = parse(value);
        if (screenshot) listener(screenshot);
      },
    );
    nativeModule.setEnabled(true);
    return () => {
      nativeModule.setEnabled(false);
      subscription.remove();
    };
  },
};
