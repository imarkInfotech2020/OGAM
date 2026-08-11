import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
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
  /** Android only: whether the media permission that makes screenshots readable was granted. */
  hasPermission?(): Promise<boolean>;
}

function module(): SyncScreenshotNativeModule {
  const nativeModule = NativeModules.SyncScreenshotModule as
    | SyncScreenshotNativeModule
    | undefined;
  // Presence of the module IS the capability. This used to also require Platform.OS === 'ios', which
  // is why Android reported "unavailable in this build" after the Android module existed: a platform
  // branch describes the build that was written, not the one that is running.
  if (!nativeModule) {
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
  available(): boolean {
    return NativeModules.SyncScreenshotModule !== undefined;
  },

  /**
   * Ask for what the watcher needs before it is started, on the platform that needs asking.
   *
   * Android reads screenshots out of the media store, so it needs a media permission; iOS asks for
   * the photo library inside its own module when observation starts. Resolves to whether observing
   * can now produce anything, so a caller can report the reason instead of silently watching nothing.
   */
  async authorize(): Promise<boolean> {
    if (Platform.OS !== 'android') return this.available();
    const nativeModule = NativeModules.SyncScreenshotModule as
      | SyncScreenshotNativeModule
      | undefined;
    if (!nativeModule) return false;
    if (await nativeModule.hasPermission?.()) return true;
    const permission =
      Number(Platform.Version) >= 33
        ? 'android.permission.READ_MEDIA_IMAGES'
        : 'android.permission.READ_EXTERNAL_STORAGE';
    const result = await PermissionsAndroid.request(
      permission as Parameters<typeof PermissionsAndroid.request>[0],
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  },

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
