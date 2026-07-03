import { create } from 'zustand';

/**
 * Owns the expanded/collapsed state of every collapsible tool accordion in the
 * chat (the "Tools sent in request (N)" list and each "<tool> result" bubble),
 * keyed by a STABLE identity that survives the streaming→finalized transition.
 *
 * Why this exists: the chat FlatList keys rows by `message.id`, and the
 * in-progress assistant reply is rendered with `id === 'streaming'` until it
 * finalizes into a real message id. That key change unmounts/remounts the row
 * and, with it, any accordion inside — so an accordion holding its expanded flag
 * in a local `useState` silently reset to collapsed on finalize (the reported
 * "tap does nothing, then suddenly opens later" bug).
 *
 * Moving the flag out of the remounting component and into this store — keyed by
 * a stable identity that does NOT depend on the transient message id — makes the
 * accordion a thin view: a remount re-reads the same flag instead of losing it.
 * Both accordions depend on this one seam (single source of truth, DRY).
 */
interface AccordionState {
  /** key (stable accordion identity) → expanded */
  expanded: Record<string, boolean>;
  setExpanded: (key: string, value: boolean) => void;
  toggle: (key: string) => void;
}

export const useAccordionStore = create<AccordionState>((set) => ({
  expanded: {},
  setExpanded: (key, value) =>
    set((s) => ({ expanded: { ...s.expanded, [key]: value } })),
  toggle: (key) =>
    set((s) => ({ expanded: { ...s.expanded, [key]: !s.expanded[key] } })),
}));

/**
 * Thin hook the accordion views use to read/write their expanded flag from the
 * owning store. Returns the current value (default collapsed) and a stable
 * toggle. A remount with the SAME `key` reads the same persisted value.
 */
export function useAccordionExpanded(key: string): [boolean, () => void] {
  const expanded = useAccordionStore((s) => s.expanded[key] ?? false);
  const toggle = useAccordionStore((s) => s.toggle);
  return [expanded, () => toggle(key)];
}
