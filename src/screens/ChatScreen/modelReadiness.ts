/**
 * Model readiness — the single typed outcome for "is a usable text model loaded
 * for this turn, and if not, WHY".
 *
 * This replaces a `Promise<boolean>` that collapsed five distinct failures
 * (no model selected, model not on disk, out of memory, a load already running,
 * the native load threw) into one opaque `false`. That collapse is why every
 * failure surfaced as the same useless "Failed to load model. Please try again."
 * alert AND why the failure was undiagnosable from logs — the reason was thrown
 * away at the return. With a typed reason: the caller renders the right intent,
 * a [GEN-SM] log line records which branch fired, and a test asserts each one.
 *
 * Single source of truth: the reason->message copy and the error->reason
 * heuristic live here ONCE and every caller reuses them (no per-call-site
 * duplication).
 */

import { AlertState, showAlert } from '../../components';
import { llmService } from '../../services';
import { liteRTService } from '../../services/litert';
import logger from '../../utils/logger';

export type ModelNotReadyReason =
  | 'no-model-selected' // no text model is selected/active for this chat
  | 'not-downloaded' // the selected model is not on disk
  | 'insufficient-memory' // could not fit the model in the residency budget
  | 'load-in-progress' // a load is already running; do not start a second
  | 'load-threw'; // the native load attempt failed

export type ModelReadyOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: ModelNotReadyReason;
      /** Underlying error text, when there is one, for the alert + the log line. */
      detail?: string;
      /** True when a lower layer already showed the user an alert for this
       *  outcome (so the caller does not double-alert). */
      alerted?: boolean;
    };

/** Map a thrown load error to a typed reason (the one place this heuristic lives). */
export function reasonFromLoadError(err: unknown): ModelNotReadyReason {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not found|no such file|missing|does not exist/i.test(msg)) return 'not-downloaded';
  if (/memory|insufficient|\boom\b|jetsam|out of/i.test(msg)) return 'insufficient-memory';
  return 'load-threw';
}

/** User-facing alert copy for a not-ready reason (the one place this copy lives). */
export function modelNotReadyAlert(
  reason: ModelNotReadyReason,
  detail?: string,
): { title: string; message: string } {
  switch (reason) {
    case 'no-model-selected':
      return { title: 'No Model Selected', message: 'Choose a text model to start chatting.' };
    case 'not-downloaded':
      return {
        title: 'Model Not Downloaded',
        message: "That model isn't on your device yet. Download it from the Models screen.",
      };
    case 'insufficient-memory':
      return {
        title: 'Not Enough Memory',
        message:
          detail ||
          'There is not enough free memory to load this model. Try unloading other models from the Home screen.',
      };
    case 'load-in-progress':
      return {
        title: 'Still Loading',
        message: 'The model is still loading. Give it a moment, then try again.',
      };
    case 'load-threw':
    default:
      return {
        title: 'Failed to Load Model',
        message: detail
          ? `The model failed to load: ${detail}`
          : 'The model failed to load. Please try again.',
      };
  }
}

/** What the readiness resolver needs from the chat screen (structural subset of
 *  GenerationDeps), so this module owns readiness without importing the screen. */
export interface ReadinessDeps {
  activeModelInfo?: { isRemote: boolean };
  activeModel: { engine?: string; filePath: string } | null | undefined;
  activeModelId: string | null;
  ensureModelLoaded: () => Promise<ModelReadyOutcome>;
  setAlertState: (a: AlertState) => void;
}

/**
 * Resolve whether a usable text model is loaded for this turn, returning a TYPED
 * outcome (not a bare boolean) so the caller knows WHY it failed and a [GEN-SM]
 * line records the branch. Every exit is explicit — no silent early-return can
 * collapse into a generic "Failed to load model" again.
 */
export async function ensureModelReady(deps: ReadinessDeps): Promise<ModelReadyOutcome> {
  if (deps.activeModelInfo?.isRemote) { logger.log('[GEN-SM] ensureModelReady → remote ok'); return { ok: true }; }
  if (deps.activeModel?.engine === 'litert') {
    if (liteRTService.isModelLoaded()) { logger.log('[GEN-SM] ensureModelReady → litert already loaded'); return { ok: true }; }
    const outcome = await deps.ensureModelLoaded();
    if (!outcome.ok) { logger.log(`[GEN-SM] ensureModelReady litert NOT ready reason=${outcome.reason} detail=${outcome.detail ?? ''}`); return outcome; }
    return liteRTService.isModelLoaded()
      ? { ok: true }
      : { ok: false, reason: 'load-threw', detail: 'LiteRT not loaded after load' };
  }
  if (!deps.activeModel || !deps.activeModelId) { logger.log('[GEN-SM] ensureModelReady → no-model-selected'); return { ok: false, reason: 'no-model-selected' }; }
  const loadedPath = llmService.getLoadedModelPath();
  if (loadedPath && loadedPath === deps.activeModel.filePath) { logger.log('[GEN-SM] ensureModelReady → already loaded'); return { ok: true }; }
  const outcome = await deps.ensureModelLoaded();
  if (!outcome.ok) { logger.log(`[GEN-SM] ensureModelReady NOT ready reason=${outcome.reason} detail=${outcome.detail ?? ''} alerted=${!!outcome.alerted}`); return outcome; }
  // Post-verify against the native truth. Catches the desync where the service
  // thinks a model is current (fast-path skip) but llama has a different/no model
  // loaded — previously this returned a bare false with no reason.
  const ready = llmService.isModelLoaded() && llmService.getLoadedModelPath() === deps.activeModel.filePath;
  if (!ready) { logger.log('[GEN-SM] ensureModelReady → load reported ok but native model mismatch'); return { ok: false, reason: 'load-threw', detail: 'the loaded model does not match the active selection' }; }
  logger.log('[GEN-SM] ensureModelReady → ready');
  return { ok: true };
}

/**
 * Resolve readiness and, on failure, log the reason and show the reason-specific
 * alert (unless a lower layer already alerted). The ONE place generation callers
 * turn a not-ready outcome into UI — no duplicated alert logic per call site.
 */
export async function ensureReadyOrAlert(deps: ReadinessDeps, tag: string): Promise<boolean> {
  const outcome = await ensureModelReady(deps);
  if (outcome.ok) return true;
  logger.log(`[GEN-SM] ${tag} BAIL reason=${outcome.reason} detail=${outcome.detail ?? ''} alerted=${!!outcome.alerted}`);
  if (!outcome.alerted) {
    const a = modelNotReadyAlert(outcome.reason, outcome.detail);
    deps.setAlertState(showAlert(a.title, a.message));
  }
  return false;
}
