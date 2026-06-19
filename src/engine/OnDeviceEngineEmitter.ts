/**
 * Minimal typed event emitter for on-device engines.
 *
 * Engines extend this to get on/off/once/emit for free.
 * Zero dependencies — no Node EventEmitter, no third-party lib.
 */

type Listener = (...args: any[]) => void;

export class OnDeviceEngineEmitter<
  TEvents extends Record<string, Listener> = Record<string, Listener>,
> {
  private _listeners = new Map<string, Set<Listener>>();

  on<K extends keyof TEvents>(event: K, listener: TEvents[K]): () => void {
    const key = event as string;
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key)!.add(listener as Listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof TEvents>(event: K, listener: TEvents[K]): void {
    this._listeners.get(event as string)?.delete(listener as Listener);
  }

  once<K extends keyof TEvents>(event: K, listener: TEvents[K]): () => void {
    const wrapper = ((...args: any[]) => {
      this.off(event, wrapper as TEvents[K]);
      (listener as Listener)(...args);
    }) as TEvents[K];
    return this.on(event, wrapper);
  }

  protected emit<K extends keyof TEvents>(
    event: K,
    ...args: Parameters<TEvents[K]>
  ): void {
    const listeners = this._listeners.get(event as string);
    if (!listeners) return;
    for (const fn of listeners) {
      try {
        fn(...args);
      } catch {
        // Swallow event handler errors to prevent cascading failures
      }
    }
  }

  /** Remove all listeners, optionally for a specific event */
  protected removeAllListeners(event?: keyof TEvents): void {
    if (event) {
      this._listeners.delete(event as string);
    } else {
      this._listeners.clear();
    }
  }

  /** Current listener count, optionally for a specific event */
  protected listenerCount(event?: keyof TEvents): number {
    if (event) {
      return this._listeners.get(event as string)?.size ?? 0;
    }
    let count = 0;
    for (const set of this._listeners.values()) {
      count += set.size;
    }
    return count;
  }
}
