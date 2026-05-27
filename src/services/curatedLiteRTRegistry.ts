/**
 * Curated LiteRT model registry — single source of truth for every LiteRT
 * artifact we ship as a recommended/featured download.
 *
 * Why this exists:
 *   The download pipeline was designed around llama .gguf files where
 *   capabilities like vision come from a separate mmproj sidecar with bytes
 *   on disk. LiteRT introduced capability *flags* (`liteRTVision`) that have
 *   no physical sidecar. Threading every new flag through the
 *   metadataJson → restore → buildDownloadedModel chain quickly becomes
 *   unmaintainable.
 *
 *   Instead, anything that's identity-bound to a curated artifact (display
 *   name, capability bits, commit-hash-pinned URL, exact byte size, marketing
 *   highlight) is colocated here. Code paths consult the registry by
 *   `fileName` — the one piece of state guaranteed to survive every transport
 *   (Room DB row, AsyncStorage, app kill, restore-from-DB) because it's the
 *   actual file on disk.
 *
 *   Llama models are never in this registry. Lookups return undefined for
 *   .gguf files, and every caller falls back to existing behavior.
 *
 *   Locally-imported .litertlm files (via "Import Local File") aren't in the
 *   registry either. Their capability bits come from the import dialog the
 *   user answers — the registry simply doesn't apply.
 */

export interface CuratedLiteRTEntry {
  /** Filename of the .litertlm artifact as written to disk. */
  fileName: string;
  /** HuggingFace repository id, e.g. `litert-community/gemma-4-E2B-it-litert-lm`. */
  hfRepoId: string;
  /** Commit hash this artifact is pinned to — the integrity guarantee. */
  commitHash: string;
  /** Exact byte size from the upstream allowlist (Gallery's source of truth). */
  sizeBytes: number;
  /** Human-readable name shown to the user in the model card / chat header. */
  displayName: string;
  /** One-line marketing highlight rendered under the model card chips. */
  highlight: string;
  /** Whether this artifact supports vision (image) input. */
  liteRTVision: boolean;
  /**
   * Optional pre-download confirmation prompt. When set, tapping Download in
   * the file detail view first shows this alert with a Cancel + Download anyway
   * choice. Useful for heavier models where most devices should pick the
   * smaller variant first.
   */
  confirmDownload?: { title: string; message: string };
}

/**
 * Every curated LiteRT model we ship. Add an entry here when adding a new one
 * — no other file needs to change.
 *
 * Commit hashes and sizes mirror Google AI Edge Gallery's allowlist
 * (`gallery/model_allowlists/1_0_14.json`) — pinning to the same revisions
 * the upstream app ships ensures we download the exact same bytes Google
 * validated for these artifacts.
 */
export const CURATED_LITERT_ENTRIES: readonly CuratedLiteRTEntry[] = [
  {
    fileName: 'gemma-4-E2B-it.litertlm',
    hfRepoId: 'litert-community/gemma-4-E2B-it-litert-lm',
    commitHash: '6e5c4f1e395deb959c494953478fa5cec4b8008f',
    sizeBytes: 2588147712,
    displayName: 'Gemma 4 E2B',
    highlight: 'Up to 2x faster than CPU via GPU',
    liteRTVision: true,
  },
  {
    fileName: 'gemma-4-E4B-it.litertlm',
    hfRepoId: 'litert-community/gemma-4-E4B-it-litert-lm',
    commitHash: '28299f30ee4d43294517a4ac93abd6163412f07f',
    sizeBytes: 3659530240,
    displayName: 'Gemma 4 E4B',
    highlight: 'Higher quality, same hardware efficiency as E2B',
    liteRTVision: true,
    confirmDownload: {
      title: 'Warning',
      message:
        "The model you have selected may exceed your device's memory and might not run reliably. For the best experience, try a smaller model.",
    },
  },
];

const CURATED_LITERT_INDEX: Map<string, CuratedLiteRTEntry> = new Map(
  CURATED_LITERT_ENTRIES.map(e => [e.fileName, e]),
);

/**
 * Look up a curated LiteRT entry by its on-disk filename. Returns undefined
 * for non-curated files — including llama .gguf files and locally-imported
 * .litertlm files. Callers should treat undefined as "fall back to existing
 * behavior" rather than as an error.
 */
export function getCuratedLiteRTEntry(fileName: string | undefined): CuratedLiteRTEntry | undefined {
  if (!fileName) return undefined;
  return CURATED_LITERT_INDEX.get(fileName);
}

/** Build the HuggingFace LFS download URL for a curated entry. */
export function buildCuratedLiteRTUrl(entry: CuratedLiteRTEntry): string {
  return `https://huggingface.co/${entry.hfRepoId}/resolve/${entry.commitHash}/${entry.fileName}?download=true`;
}
