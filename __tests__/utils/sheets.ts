import { within, type RenderAPI } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

/**
 * The action belonging to the sheet asking a given question.
 *
 * Every confirmation in this app is an in-app sheet rather than a system modal, and their actions are not
 * uniquely named: more than one sheet says "Cancel", and a sheet's confirm often repeats the label of the
 * button that opened it ("Clear" opens the clear-history sheet and confirms it). So the action is found by
 * the title standing beside it.
 *
 * The walk starts at the title and climbs, because React inserts wrapper nodes and the sheet body is not
 * reliably the immediate parent - it is the nearest ancestor holding both the title and the action.
 */
export function sheetAction(
  ui: RenderAPI,
  title: string,
  action: string,
): ReactTestInstance {
  const heading = ui.getByText(title);
  for (let node = heading.parent; node; node = node.parent) {
    const candidates = within(node)
      .queryAllByText(action)
      .filter(found => found !== heading);
    if (candidates.length > 0) return candidates[0];
  }
  throw new Error(`the "${title}" sheet offers no "${action}"`);
}
