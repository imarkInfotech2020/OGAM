/**
 * Generic engine registry.
 *
 * Works for any modality — TTS, STT, Vision, LLM.
 * Engines register a factory; the registry lazily instantiates and
 * manages the active engine lifecycle.
 *
 * Usage:
 *   const ttsRegistry = new EngineRegistry<TTSEngine>();
 *   ttsRegistry.register('kokoro', () => new KokoroEngine());
 *   await ttsRegistry.setActiveEngine('kokoro');
 */
import type { OnDeviceEngine, BaseEngineEvents } from './types';

export type EngineFactory<T> = () => T;

interface Stoppable { stop(): void; }
function hasStop(obj: unknown): obj is Stoppable {
  return typeof obj === 'object' && obj !== null && 'stop' in obj && typeof (obj as Stoppable).stop === 'function';
}

export class EngineRegistry<
  T extends OnDeviceEngine<BaseEngineEvents>,
> {
  private _factories = new Map<string, EngineFactory<T>>();
  private _instances = new Map<string, T>();
  private _activeId: string | null = null;

  /** Register an engine factory. Call once per engine at module load time. */
  register(id: string, factory: EngineFactory<T>): void {
    this._factories.set(id, factory);
  }

  /** Unregister an engine. Releases instance if it exists. */
  async unregister(id: string): Promise<void> {
    const instance = this._instances.get(id);
    if (instance) {
      if (hasStop(instance)) instance.stop();
      await instance.release();
      this._instances.delete(id);
    }
    this._factories.delete(id);
    if (this._activeId === id) {
      this._activeId = null;
    }
  }

  /** All registered engine IDs */
  getRegisteredIds(): string[] {
    return Array.from(this._factories.keys());
  }

  /** Check if an engine ID is registered */
  has(id: string): boolean {
    return this._factories.has(id);
  }

  /** Get or lazily create a singleton engine instance */
  getEngine(id: string): T {
    let engine = this._instances.get(id);
    if (!engine) {
      const factory = this._factories.get(id);
      if (!factory) {
        throw new Error(`Engine '${id}' is not registered.`);
      }
      engine = factory();
      this._instances.set(id, engine);
    }
    return engine;
  }

  /**
   * Set the active engine. Stops and releases the previous one.
   * Returns the newly active engine instance.
   */
  async setActiveEngine(id: string): Promise<T> {
    if (this._activeId && this._activeId !== id) {
      const prev = this._instances.get(this._activeId);
      if (prev) {
        try {
          if (hasStop(prev)) prev.stop();
          await prev.release();
        } catch {
          // Best-effort cleanup
        }
      }
    }
    this._activeId = id;
    return this.getEngine(id);
  }

  /** Currently active engine (null if none set) */
  getActiveEngine(): T | null {
    if (!this._activeId) return null;
    return this._instances.get(this._activeId) ?? null;
  }

  /** Currently active engine ID (null if none set) */
  getActiveEngineId(): string | null {
    return this._activeId;
  }

  /** Release all engine instances */
  async releaseAll(): Promise<void> {
    for (const [, engine] of this._instances) {
      try {
        if (hasStop(engine)) engine.stop();
        await engine.release();
      } catch {
        // Best-effort
      }
    }
    this._instances.clear();
    this._activeId = null;
  }
}
