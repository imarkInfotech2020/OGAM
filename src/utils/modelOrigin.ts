import type { ModelOrigin } from '../types';

/**
 * Reads a Hugging Face resolve URL back into the provenance it encodes.
 *
 *   https://huggingface.co/{owner}/{name}/resolve/{revision}/{path}
 *
 * Every download path in this app builds exactly that shape - the catalog, the HF browser, the
 * CoreML browser, the curated LiteRT registry and the Whisper models - so one parser covers every
 * model on Hugging Face, whether or not it is in our catalog.
 *
 * Returns null for anything else: a local import has no upstream, and inventing one is what turned
 * a missing field into a 401 in a dialog.
 */
export function parseHuggingFaceUrl(url: string | undefined): ModelOrigin | null {
  if (!url) return null;
  const match = /^https?:\/\/huggingface\.co\/(.+?)\/resolve\/([^/]+)\/(.+)$/.exec(
    url.split('?')[0],
  );
  if (!match) return null;
  const [, repoId, revision, path] = match;
  // A repo id is always `owner/name`; anything shallower is a URL we do not understand.
  if (repoId.split('/').length < 2) return null;
  return { repoId, revision, path };
}

/** The download URL for a sibling file in the SAME repo and at the SAME revision. */
export function siblingDownloadUrl(origin: ModelOrigin, fileName: string): string {
  return `https://huggingface.co/${origin.repoId}/resolve/${origin.revision}/${fileName}`;
}
