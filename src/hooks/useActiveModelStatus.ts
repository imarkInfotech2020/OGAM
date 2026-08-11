import { useEffect, useState } from 'react';
import { activeModelService } from '../services/activeModelService';
import type { ActiveModelInfo } from '../services/activeModelService/types';

/**
 * The active-model snapshot, live: which model is selected, whether it is loaded, whether a load is
 * running. One subscription to the owning service, shared by every surface that asks.
 *
 * Before this, three views answered the question from three different places - the chat from its own
 * useState, the model sheet from a flag it set when you tapped a row, Home from a third - so they
 * disagreed in exactly the ways you would expect: a sheet showing a spinner for a load that never
 * started, a chat refusing to send to a model the engine had loaded. A view that renders state it does
 * not own is a view that can be wrong; this hook is the only place that reads it.
 */
export function useActiveModelStatus(): ActiveModelInfo {
  const [info, setInfo] = useState<ActiveModelInfo>(() =>
    activeModelService.getActiveModels(),
  );

  useEffect(() => {
    // Re-read on subscribe: the snapshot can have moved between the first render and this effect.
    setInfo(activeModelService.getActiveModels());
    return activeModelService.subscribe(setInfo);
  }, []);

  return info;
}
