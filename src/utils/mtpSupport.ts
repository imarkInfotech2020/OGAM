/**
 * Does this model carry MTP (multi-token prediction) draft layers?
 *
 * Pure: it takes the GGUF metadata a model publishes about itself and answers yes or no. No IO, so
 * the rule is testable against real metadata dumps rather than guessed at.
 *
 * MTP weights are declared in the architecture's own keys, and the key NAME differs per family —
 * Qwen's next-N prediction layers, DeepSeek's MTP block, and whatever the next architecture calls
 * it. Matching one exact key would silently answer "no" for every family but the one we wrote it
 * for, and a false no is invisible: the user simply never sees the suggestion. So this looks for
 * the MARKER in the key, across whatever keys the model declares.
 *
 * A false positive is cheap by comparison — enabling MTP on a model without draft layers makes the
 * engine never draft, which costs nothing.
 */

/** Substrings that name MTP draft layers in a GGUF's architecture keys. */
const MTP_KEY_MARKERS = ['nextn', 'mtp', 'multi_token'];

/** A key only counts when it declares a COUNT of draft layers greater than zero. A model that
 *  mentions the concept with zero layers has no draft weights to run. */
function declaresDraftLayers(key: string, value: unknown): boolean {
  if (!MTP_KEY_MARKERS.some(marker => key.toLowerCase().includes(marker))) return false;
  const count = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(count) ? count > 0 : Boolean(value);
}

export function modelDeclaresMtp(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  return Object.entries(metadata).some(([key, value]) => declaresDraftLayers(key, value));
}
