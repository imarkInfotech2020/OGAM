/**
 * A native module that raises events at JavaScript, and the emitter that carries them.
 *
 * Both platforms' modules work this way: the module is also the event source, and JS subscribes through a
 * `NativeEventEmitter` constructed over it. This is the only part stood in for - dispatch is real, so a
 * listener that was never attached, or was removed too early, shows up as an event that goes nowhere rather
 * than as an assertion on a spy.
 *
 * Extend `NativeEventBus` from a module fake, and hand `FakeNativeEventEmitter` to the code under test in
 * place of RN's. Because the emitter binds to the module object it was constructed with, several devices'
 * modules can coexist in one test without their events crossing.
 */

export type NativeEventListener = (payload: unknown) => void;

export interface NativeEventSource {
  readonly listeners: Map<string, Set<NativeEventListener>>;
}

export class NativeEventBus implements NativeEventSource {
  readonly listeners = new Map<string, Set<NativeEventListener>>();

  /** Raise an event at whoever is listening, the way the native side does. */
  emit(eventName: string, payload: unknown): void {
    // Iterated over a copy: a listener that unsubscribes while being called is normal.
    for (const listener of [...(this.listeners.get(eventName) ?? [])]) {
      listener(payload);
    }
  }
}

export class FakeNativeEventEmitter {
  constructor(private readonly module: NativeEventSource) {}

  addListener(
    eventName: string,
    listener: NativeEventListener,
  ): { remove(): void } {
    const listeners = this.module.listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.module.listeners.set(eventName, listeners);
    return {
      remove: () => {
        this.module.listeners.get(eventName)?.delete(listener);
      },
    };
  }
}
