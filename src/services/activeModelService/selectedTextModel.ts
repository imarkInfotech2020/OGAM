import type { DownloadedModel } from '../../types';
import { resolveDownloadedModel } from './resolveModel';

interface SelectedTextModelDeps {
  /** The selection and the list, read together so they are always the same instant. */
  read: () => {
    models: readonly DownloadedModel[];
    selectedId: string | null;
  };
  warn: (message: string) => void;
}

/**
 * The resolver for "which text model is selected", with drift reported once per id.
 *
 * Separate from the service so the rule is testable without the store, and so the service keeps one
 * responsibility per member. The remembered id is the only state here: a warning per render would
 * bury the signal it exists to raise.
 */
export function createSelectedTextModelResolver(
  deps: SelectedTextModelDeps,
): () => DownloadedModel | null {
  let reported: string | null = null;
  return () => {
    const { models, selectedId } = deps.read();
    const { model, matchedBy } = resolveDownloadedModel(models, selectedId);
    if (selectedId && matchedBy !== 'id' && reported !== selectedId) {
      reported = selectedId;
      deps.warn(
        `[ActiveModel] selected id did not match the downloaded list (matchedBy=${matchedBy}, models=${models.length})`,
      );
    }
    return model;
  };
}

/**
 * The id to load for a turn: the current selection, or the remembered choice when a user unload
 * cleared the selection. PURE.
 *
 * The ONE place that ordering is decided. Callers used to write `activeModelId ?? lastTextModelId`
 * inline, and the chat's load path read `lastTextModelId` ALONE - which is only written when a model is
 * picked from a sheet. So after a load that came from anywhere else the two disagreed, and chat loaded
 * the older model while the newer one sat selected on screen (device, 2026-07-31: picked Qwen 3.5,
 * loaded SmolVLM).
 */
export function selectedTextModelIdOf(state: {
  activeModelId: string | null;
  lastTextModelId: string | null;
}): string | null {
  return state.activeModelId ?? state.lastTextModelId;
}
