import type { HomeSectionId } from '../types';

/**
 * The Home view's sections, and the order a reader can put them in.
 *
 * The Home view is a stack, not a fixed page: every block has a stable id, a
 * width and a place in one order list. The rules live here rather than in the
 * view so a saved file can be repaired — a list written by an older build is
 * missing whatever was added since, and a hand-edited one can name anything.
 *
 * Two blocks that share a row keep sharing it wherever they end up: the order
 * list decides which row comes first, and a `half` block with no `half` beside
 * it takes the whole width rather than leaving a gap.
 */

export const HOME_SECTIONS: HomeSectionId[] = ['actions', 'launch', 'recent', 'startup'];

export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  actions: 'Common actions',
  launch: 'Quick launch',
  recent: 'Recent activity',
  startup: 'Startup',
};

/** Whether a section shares its row with the next one. */
export type HomeSectionWidth = 'full' | 'half';

export const HOME_SECTION_WIDTHS: Record<HomeSectionId, HomeSectionWidth> = {
  actions: 'full',
  launch: 'full',
  recent: 'half',
  startup: 'half',
};

export const DEFAULT_SECTION_ORDER: HomeSectionId[] = [...HOME_SECTIONS];

export function isHomeSectionId(value: unknown): value is HomeSectionId {
  return typeof value === 'string' && (HOME_SECTIONS as readonly string[]).includes(value);
}

/**
 * The saved order, with anything missing appended in its default place.
 *
 * A file from before this setting existed carries no list at all and gets the
 * default; a list that names an unknown block has it dropped; a block added by
 * a later build is appended rather than lost. Duplicates are ignored, so a
 * section can never be drawn twice.
 */
export function normalizeSectionOrder(raw: unknown): HomeSectionId[] {
  const order: HomeSectionId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isHomeSectionId(item) && !order.includes(item)) order.push(item);
    }
  }
  for (const id of DEFAULT_SECTION_ORDER) if (!order.includes(id)) order.push(id);
  return order;
}

/**
 * Moves one section by one place.
 *
 * The move is a swap with the neighbour in the direction asked for, which is
 * what a pair of arrow buttons means; the ends are no-ops, so pressing Up on the
 * first row never wraps the list into a surprise.
 */
export function moveSection(
  order: HomeSectionId[],
  id: HomeSectionId,
  delta: -1 | 1,
): HomeSectionId[] {
  const current = normalizeSectionOrder(order);
  const index = current.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= current.length) return current;
  const next = [...current];
  const held = next[index]!;
  next[index] = next[target]!;
  next[target] = held;
  return next;
}

/**
 * The section at `index` and, when the next one also shares a row, that one too.
 *
 * The result is empty only for an index past the end, which the caller cannot
 * reach on a normalized order; it is typed as a list so the walk stays a loop.
 */
export function rowWith(order: HomeSectionId[], index: number): HomeSectionId[] {
  const id = order[index];
  const next = order[index + 1];
  if (!id) return [];
  if (
    next &&
    HOME_SECTION_WIDTHS[id] === 'half' &&
    HOME_SECTION_WIDTHS[next] === 'half'
  ) {
    return [id, next];
  }
  return [id];
}
