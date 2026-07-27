import {
  NativeEventEmitter,
  NativeModules,
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
}

export interface NativeClipboardBoundary {
  observe(listener: (change: NativeClipboardChange) => void): () => void;
  writeText(text: string): void;
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
        listener({ text: change.text, ts: change.ts });
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
};
