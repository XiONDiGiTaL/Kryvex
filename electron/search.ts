import type { DownloadRecord } from './types';
import { rankItems, searchTerms, type SearchHit, type SearchItem } from './search-rules';

/**
 * Kryvex's one local index.
 *
 * The records come from what the app already keeps: the state file the main
 * process owns (services, browser history, bookmarks) and the download
 * manager's own list. Nothing is fetched, nothing is cached to a second file,
 * and a query never reaches a network. The palette adds its own commands and
 * themes in the renderer, scored by the same rules.
 *
 * Every field is treated as untrusted input even though this module writes the
 * state file's shape elsewhere: a hand-edited or older profile is the normal
 * case, and one broken record must not empty the results.
 */

/** How much of a long list is worth indexing for one keystroke. */
const MAX_HISTORY = 400;
const MAX_BOOKMARKS = 400;

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function stamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Every searchable record, in the order the sources are worth showing: a
 * service someone installed before a page they once visited.
 */
export function collectIndex(input: {
  state: unknown;
  downloads: readonly DownloadRecord[];
}): SearchItem[] {
  const state = object(input.state);
  const items: SearchItem[] = [];

  for (const raw of Array.isArray(state.services) ? state.services : []) {
    const service = object(raw);
    const id = text(service.id, 120);
    const url = text(service.url, 2048);
    if (!id || !/^https?:\/\//i.test(url)) continue;
    const name = text(service.name, 200) || hostOf(url);
    items.push({
      id: `service:${id}`,
      source: 'service',
      title: name,
      subtitle: hostOf(url),
      url,
      at: stamp(service.lastOpened),
    });
  }

  for (const raw of (Array.isArray(state.history) ? state.history : []).slice(0, MAX_HISTORY)) {
    const entry = object(raw);
    const id = text(entry.id, 120);
    const url = text(entry.url, 2048);
    if (!id || !/^https?:\/\//i.test(url)) continue;
    items.push({
      id: `history:${id}`,
      source: 'history',
      title: text(entry.title, 200) || hostOf(url),
      subtitle: hostOf(url),
      url,
      at: stamp(entry.visitedAt),
    });
  }

  for (const raw of (Array.isArray(state.bookmarks) ? state.bookmarks : []).slice(
    0,
    MAX_BOOKMARKS,
  )) {
    const entry = object(raw);
    const id = text(entry.id, 120);
    const url = text(entry.url, 2048);
    if (!id || !/^https?:\/\//i.test(url)) continue;
    items.push({
      id: `bookmark:${id}`,
      source: 'bookmark',
      title: text(entry.title, 200) || hostOf(url),
      subtitle: hostOf(url),
      url,
      at: stamp(entry.createdAt),
    });
  }

  for (const record of input.downloads) {
    const id = text(record.id, 120);
    const filename = text(record.filename, 200);
    if (!id || !filename) continue;
    items.push({
      id: `download:${id}`,
      source: 'download',
      title: filename,
      // The URL says where it came from; the path would be noise in a row.
      subtitle: hostOf(text(record.url, 2048)) || text(record.savePath, 240),
      url: /^https?:\/\//i.test(record.url) ? record.url : undefined,
      path: text(record.savePath, 2048) || undefined,
      at: stamp(record.updatedAt) ?? stamp(record.startedAt),
    });
  }

  return items;
}

/** One query against the local index. An unusable query returns nothing. */
export function searchLocal(
  input: { state: unknown; downloads: readonly DownloadRecord[] },
  rawQuery: unknown,
): SearchHit[] {
  const terms = searchTerms(rawQuery);
  if (!terms) return [];
  return rankItems(collectIndex(input), terms);
}
