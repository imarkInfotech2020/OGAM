import { DownloadedModel } from '../../types';
import logger from '../../utils/logger';

/**
 * One row per FILE. Repairs a registry that already grew duplicates.
 *
 * Rows are dropped, never files. Two rows naming the same file are two descriptions of one download,
 * and one of them is wrong - it was minted by a scan that could not recognise a file it already had,
 * because the identity it compared was an absolute path and iOS moves those on every reinstall.
 *
 * The survivor is the most trustworthy description, in this order:
 *   1. a real catalog id over a `recovered_` one - it carries the author, quantization and credibility
 *      a recovered row invents as "Unknown"
 *   2. the earliest download - the row that was there when the file actually arrived
 *
 * Idempotent, so running it on an already-clean registry changes nothing.
 */
export function collapseDuplicateFileRows(models: DownloadedModel[]): {
  models: DownloadedModel[];
  collapsed: number;
} {
  const best = new Map<string, DownloadedModel>();
  const order: string[] = [];
  let collapsed = 0;

  const isRecovered = (model: DownloadedModel): boolean => model.id.startsWith('recovered_');
  const earliest = (a: DownloadedModel, b: DownloadedModel): DownloadedModel =>
    (a.downloadedAt ?? '') <= (b.downloadedAt ?? '') ? a : b;

  for (const model of models) {
    // No file name is nothing to key on: keep the row untouched rather than guess.
    if (!model.fileName) {
      order.push(`@keep:${order.length}`);
      best.set(`@keep:${order.length - 1}`, model);
      continue;
    }
    const existing = best.get(model.fileName);
    if (!existing) {
      best.set(model.fileName, model);
      order.push(model.fileName);
      continue;
    }
    collapsed += 1;
    if (isRecovered(existing) && !isRecovered(model)) best.set(model.fileName, model);
    else if (isRecovered(existing) === isRecovered(model)) {
      best.set(model.fileName, earliest(existing, model));
    }
  }

  if (collapsed > 0) {
    logger.log(
      `[ModelManagerStorage] collapsed ${collapsed} duplicate model row(s) to one per file; ` +
        `${order.length} model(s) remain`,
    );
  }
  return { models: order.map(key => best.get(key)!), collapsed };
}
