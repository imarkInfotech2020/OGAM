import type { DownloadedModel } from '../../types';

/** How a selected id was matched to a downloaded model, so a fallback match can be reported. */
type ModelMatch = 'id' | 'file' | 'none';

export interface ResolvedModel {
  model: DownloadedModel | null;
  matchedBy: ModelMatch;
}

/**
 * Resolve a selected model id against the downloaded list. PURE: no store, no IO, no logging.
 *
 * Why a fallback exists at all: the selected id is PERSISTED while the downloaded list is REBUILT at
 * launch by scanning the models directory. When a rebuild produces a different id for the same file
 * on disk, an exact-id lookup returns nothing and every surface that asks "is a model selected"
 * answers no - while the engine happily has that very file loaded. That is the state that stranded
 * the chat: a live model, a refused send, and "please select a model" (device, 2026-07-31).
 *
 * The file on disk is the durable identity, so a failed id match falls back to the file name the id
 * ends with. `matchedBy` is returned rather than swallowed so the caller can report the drift instead
 * of hiding it.
 */
export function resolveDownloadedModel(
  models: readonly DownloadedModel[],
  selectedId: string | null | undefined,
): ResolvedModel {
  if (!selectedId) return { model: null, matchedBy: 'none' };
  const byId = models.find(model => model.id === selectedId);
  if (byId) return { model: byId, matchedBy: 'id' };
  const fileName = fileNameOf(selectedId);
  if (!fileName) return { model: null, matchedBy: 'none' };
  const byFile = models.find(
    model => model.fileName === fileName || fileNameOf(model.filePath) === fileName,
  );
  return byFile ? { model: byFile, matchedBy: 'file' } : { model: null, matchedBy: 'none' };
}

/** The last path segment, which for a model id is the GGUF/LiteRT file it was built from. */
function fileNameOf(value: string): string | null {
  const segments = value.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last && last.includes('.') ? last : null;
}
