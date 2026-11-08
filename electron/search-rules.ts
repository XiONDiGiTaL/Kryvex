/**
 * The rules behind Kryvex's unified search.
 *
 * Everything here is pure. The index itself is built in `electron/search.ts`
 * from the state file and the download manager, and the renderer scores its own
 * commands with the same function, so a palette command and a history entry are
 * ranked by one rule rather than by two implementations that drift apart.
 *
 * Matching is deliberately plain: every term must appear somewhere in the
 * record, and a term that starts a title outranks one found in a URL or a path.
 * There is no fuzzy matching, because a fuzzy local index answers with things
 * the user did not ask for and cannot tell apart from the exact match.
 */

export type SearchSource = 'service' | 'history' | 'bookmark' | 'download' | 'command';

export interface SearchItem {
  id: string;
  source: SearchSource;
  title: string;
  /** A host, a path, a date: whatever helps the row identify itself. */
  subtitle?: string;
  /** What opening the result loads, when it loads a page. */
  url?: string;
  /** Where the file is, for a download that reached the disk. */
  path?: string;
  /** Epoch milliseconds, used only to order equally good matches. */
  at?: number;
}

export interface SearchHit extends SearchItem {
  score: number;
}

export const SEARCH_RESULT_LIMIT = 40;
export const MAX_SEARCH_QUERY = 120;
const MAX_TERMS = 8;
const MAX_TITLE = 200;
const MAX_SUBTITLE = 240;

/** Where a term was found: the numbers only have to order, not to mean. */
const TITLE_EXACT = 160;
const TITLE_START = 100;
const TITLE_WORD = 70;
const TITLE_PART = 45;
const SECONDARY = 20;

/**
 * Whole lower-case terms, or `null` when the query is not worth running.
 *
 * A query is capped rather than rejected: someone pasting a paragraph should
 * get the first few words, not a refusal.
 */
export function searchTerms(raw: unknown): string[] | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, MAX_SEARCH_QUERY);
  if (!trimmed) return null;
  const terms = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return [...new Set(terms)];
}

/** True when `term` starts a word in `haystack`, not only a later substring. */
function startsWord(haystack: string, term: string): boolean {
  let index = haystack.indexOf(term);
  while (index !== -1) {
    if (index === 0 || /[\s\-_/:.,|·›>()[\]@]/.test(haystack[index - 1] ?? '')) return true;
    index = haystack.indexOf(term, index + 1);
  }
  return false;
}

/**
 * How well one record matches every term, or `null` when a term is missing.
 *
 * All terms must match: searching two words narrows the list instead of
 * widening it, which is what a person typing a second word expects.
 */
export function matchScore(
  item: Pick<SearchItem, 'title' | 'subtitle' | 'url' | 'path'>,
  terms: readonly string[],
): number | null {
  if (terms.length === 0) return null;
  const title = item.title.toLowerCase();
  const secondary = [item.subtitle, item.url, item.path]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' \u0000 ')
    .toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (title === term) score += TITLE_EXACT;
    else if (title.startsWith(term)) score += TITLE_START;
    else if (startsWord(title, term)) score += TITLE_WORD;
    else if (title.includes(term)) score += TITLE_PART;
    else if (secondary.includes(term)) score += SECONDARY;
    else return null;
  }
  return score;
}

/** The ranked answer to one query: score first, then recency, then name. */
export function rankItems(
  items: readonly SearchItem[],
  terms: readonly string[],
  limit = SEARCH_RESULT_LIMIT,
): SearchHit[] {
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const item of items) {
    const score = matchScore(item, terms);
    if (score !== null) hits.push({ ...item, score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      (b.at ?? 0) - (a.at ?? 0) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
  const capped = Math.max(1, Math.min(Math.floor(limit) || SEARCH_RESULT_LIMIT, SEARCH_RESULT_LIMIT));
  return hits.slice(0, capped);
}

const SOURCES: SearchSource[] = ['service', 'history', 'bookmark', 'download', 'command'];

function shortText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Coerce what the bridge handed back into records the palette can draw.
 *
 * The main process builds these, but the renderer still governs what it paints:
 * an unknown source, a missing title or a record that is not an object is
 * dropped rather than rendered as "undefined".
 */
export function sanitizeSearchHits(raw: unknown, limit = SEARCH_RESULT_LIMIT): SearchHit[] {
  if (!Array.isArray(raw)) return [];
  const hits: SearchHit[] = [];
  for (const entry of raw.slice(0, SEARCH_RESULT_LIMIT)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const value = entry as Record<string, unknown>;
    const title = shortText(value.title, MAX_TITLE);
    if (!title) continue;
    const source = SOURCES.includes(value.source as SearchSource)
      ? (value.source as SearchSource)
      : null;
    if (!source) continue;
    const id = shortText(value.id, 240);
    if (!id) continue;
    const hit: SearchHit = {
      id,
      source,
      title,
      score: typeof value.score === 'number' && Number.isFinite(value.score) ? value.score : 0,
    };
    const subtitle = shortText(value.subtitle, MAX_SUBTITLE);
    if (subtitle) hit.subtitle = subtitle;
    const url = shortText(value.url, 2048);
    if (/^https?:\/\//i.test(url)) hit.url = url;
    const filePath = shortText(value.path, 2048);
    if (filePath) hit.path = filePath;
    if (typeof value.at === 'number' && Number.isFinite(value.at)) hit.at = value.at;
    hits.push(hit);
  }
  return hits.slice(0, Math.max(1, Math.min(limit, SEARCH_RESULT_LIMIT)));
}
