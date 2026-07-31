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
