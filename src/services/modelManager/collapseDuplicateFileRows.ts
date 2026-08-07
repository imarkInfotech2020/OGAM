import { DownloadedModel, ONNXImageModel } from '../../types';
import logger from '../../utils/logger';
import { basenameOf } from './reconcileStoredPaths';

/**
 * One row per stored artifact. Repairs a registry that already grew duplicates.
 *
 * Rows are dropped, never artifacts. Two rows naming the same artifact are two descriptions of one
 * download, and one of them is wrong - it was minted by a scan that could not recognise something it
 * already had, because the identity it compared was an absolute path and iOS moves those on every
 * reinstall.
 *
 * The survivor is the most trustworthy description, in this order:
 *   1. a real catalog id over a `recovered_` one - it carries the author, quantization and credibility
 *      a recovered row invents as "Unknown"
 *   2. the earliest download - the row that was there when the artifact actually arrived
 *
 * Idempotent, so running it on an already-clean registry changes nothing.
 */
interface CollapseSpec<T> {
  /** Stable identity. `undefined` means "cannot key this row" - it is kept untouched, never guessed at. */
  keyOf: (row: T) => string | undefined;
  idOf: (row: T) => string;
  downloadedAtOf: (row: T) => string | undefined;
  /** What one key names, for the log line: `file` or `directory`. */
  unit: string;
}

function collapseRows<T>(rows: T[], spec: CollapseSpec<T>): { rows: T[]; collapsed: number } {
  const best = new Map<string, T>();
  const order: string[] = [];
  let collapsed = 0;

  const isRecovered = (row: T): boolean => spec.idOf(row).startsWith('recovered_');
  const earliest = (a: T, b: T): T =>
    (spec.downloadedAtOf(a) ?? '') <= (spec.downloadedAtOf(b) ?? '') ? a : b;

  for (const row of rows) {
    const key = spec.keyOf(row);
    if (!key) {
      const sentinel = `@keep:${order.length}`;
      order.push(sentinel);
      best.set(sentinel, row);
      continue;
    }
    const existing = best.get(key);
    if (!existing) {
      best.set(key, row);
      order.push(key);
      continue;
    }
    collapsed += 1;
    if (isRecovered(existing) && !isRecovered(row)) best.set(key, row);
    else if (isRecovered(existing) === isRecovered(row)) {
      best.set(key, earliest(existing, row));
    }
  }

  if (collapsed > 0) {
    logger.log(
      `[ModelManagerStorage] collapsed ${collapsed} duplicate model row(s) to one per ${spec.unit}; ` +
        `${order.length} model(s) remain`,
    );
  }
  return { rows: order.map(key => best.get(key)!), collapsed };
}

export function collapseDuplicateFileRows(models: DownloadedModel[]): {
  models: DownloadedModel[];
  collapsed: number;
} {
  const { rows, collapsed } = collapseRows(models, {
    keyOf: model => model.fileName,
    idOf: model => model.id,
    downloadedAtOf: model => model.downloadedAt,
    unit: 'file',
  });
  return { models: rows, collapsed };
}

/**
 * The image-model registry keys on the model DIRECTORY name - an ONNX model is a directory of files,
 * so the directory is what a row describes.
 */
export function collapseDuplicateImageRows(models: ONNXImageModel[]): {
  models: ONNXImageModel[];
  collapsed: number;
} {
  const { rows, collapsed } = collapseRows(models, {
    keyOf: model => basenameOf(model.modelPath) || undefined,
    idOf: model => model.id,
    downloadedAtOf: model => model.downloadedAt,
    unit: 'directory',
  });
  return { models: rows, collapsed };
}
