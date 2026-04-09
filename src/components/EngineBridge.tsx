/**
 * EngineBridge
 *
 * Renders the React bridge component for the currently active TTS engine
 * (if it needs one). Mount once at the app root.
 *
 * Engines that are fully imperative (OuteTTS, Qwen3-TTS) return null
 * from getBridgeComponent() and this renders nothing.
 *
 * Hook-based engines (Kokoro) return a component that mounts their
 * React hooks and registers imperative handles with the engine instance.
 *
 * Platform gating: if the engine declares platformRequirements and the
 * device doesn't meet them, the bridge is not rendered (prevents crashes
 * from mounting native hooks on unsupported OS versions).
 */
import React, { useMemo } from 'react';
import { useTTSStore } from '../stores/ttsStore';
import { ttsRegistry } from '../engine';

export const EngineBridge: React.FC = () => {
  const engineId = useTTSStore(s => s.settings.engineId);

  const BridgeComponent = useMemo(() => {
    if (!ttsRegistry.has(engineId)) return null;
    try {
      const engine = ttsRegistry.getEngine(engineId);
      if (!engine.isSupported()) return null;
      return engine.getBridgeComponent();
    } catch {
      return null;
    }
  }, [engineId]);

  if (!BridgeComponent) return null;
  return <BridgeComponent />;
};
