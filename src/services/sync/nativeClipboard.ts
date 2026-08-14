import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';

const CLIPBOARD_CHANGED_EVENT = 'SyncClipboardChanged';

export interface NativeClipboardChange {
  text: string;
  ts: number;
}

interface SyncClipboardNativeModule {
  setEnabled(enabled: boolean): void;
  writeText(text: string): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  /** Android only: is the selection-reporting service switched on in system settings? */
  isAccessibilityEnabled?(): Promise<boolean>;
  /** Android only: open the system Accessibility screen, the only place the grant lives. */
  openAccessibilitySettings?(): void;
}

export interface NativeClipboardBoundary {
  observe(listener: (change: NativeClipboardChange) => void): () => void;
  writeText(text: string): void;
  /**
   * Can this platform capture a copy made in ANOTHER app right now?
   *
   * A fact, not a verdict, and asked rather than remembered: on Android the user can revoke the
   * accessibility grant in Settings without this app being told. iOS answers true because it has no
   * such gate - and answering `false` there would send the user hunting for a switch that does not
   * exist.
   */
  canCaptureInBackground(): Promise<boolean>;
  /** Take the user to where the grant lives. A no-op where there is nothing to grant. */
  requestBackgroundCapture(): void;
}

function module(): SyncClipboardNativeModule {
  const nativeModule = NativeModules.SyncClipboardModule as
    | SyncClipboardNativeModule
    | undefined;
  if (!nativeModule) {
    throw new Error('Native clipboard sync is unavailable in this build.');
  }
  return nativeModule;
}

export const nativeClipboardBoundary: NativeClipboardBoundary = {
  observe(listener): () => void {
    const nativeModule = module();
    const emitter = new NativeEventEmitter(nativeModule);
    const subscription: EmitterSubscription = emitter.addListener(
      CLIPBOARD_CHANGED_EVENT,
      (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        const change = value as Partial<NativeClipboardChange>;
        if (typeof change.text !== 'string' || typeof change.ts !== 'number') {
          return;
        }
        const timestamp = Math.trunc(change.ts);
        if (!Number.isSafeInteger(timestamp)) return;
        listener({ text: change.text, ts: timestamp });
      },
    );
    nativeModule.setEnabled(true);
    return () => {
      nativeModule.setEnabled(false);
      subscription.remove();
    };
  },

  writeText(text): void {
    module().writeText(text);
  },

  async canCaptureInBackground(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const ask = module().isAccessibilityEnabled;
    // An older native build without the method is not a denial: it is a build that cannot answer, and
    // treating silence as "off" would nag the user to enable something this app cannot even see.
    if (!ask) return true;
    return ask();
  },

  requestBackgroundCapture(): void {
    if (Platform.OS !== 'android') return;
    module().openAccessibilitySettings?.();
  },
};
