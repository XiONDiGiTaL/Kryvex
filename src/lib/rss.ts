import type { RssFeed, RssItem } from '../types';
import { hostOf, normalizeUrl } from './url';

/**
 * RSS/Atom reading for the start page.
 *
 * Feeds are fetched by the main process (so the renderer never needs CORS
 * permission) and parsed here. Parsing is deliberately tolerant: feeds in the
 * wild omit channel titles, put the link in `guid`, use CDATA, or ship Atom's
 * attribute form of `<link>`. Anything that cannot be understood is dropped
 * instead of being rendered, and no markup from a feed is ever executed.
 */

export const MAX_FEEDS = 12;
export const MAX_FEED_ITEMS = 12;
const MAX_FEED_BYTES = 2 * 1024 * 1024;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '-',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
};

/** Feed URLs are ordinary http(s) URLs; bare hosts get https. */
export function normalizeFeedUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || value.length > 2048) return '';
  try {
    return normalizeUrl(value);
  } catch {
    return '';
  }
}

/** A readable label when the feed has no title yet. */
export function feedLabel(url: string): string {
  return hostOf(url) || url;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Feed bodies are untrusted markup; only their text is shown. */
export function stripMarkup(value: string): string {
  return decodeEntities(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function tagValue(source: string, names: string[]): string {
  for (const name of names) {
    const pattern = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
    const match = pattern.exec(source);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value) return value;
    }
  }
  return '';
}

function resolveLink(href: string, base: string): string {
  const value = href.trim();
  if (!value) return '';
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

/** Picks Atom's `<link rel="alternate" href>` before any other link. */
function itemLink(block: string, base: string): string {
  const links: Array<{ href: string; rel: string }> = [];
  const pattern = /<link\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block))) {
    const attributes = match[1] ?? '';
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    if (!href) continue;
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    links.push({
      href: href[1] ?? href[2] ?? '',
      rel: (rel?.[1] ?? rel?.[2] ?? '').toLowerCase(),
    });
  }
  const alternate = links.find(link => link.rel === '' || link.rel === 'alternate');
  const chosen = alternate ?? links[0];
  if (chosen?.href) {
    const resolved = resolveLink(chosen.href, base);
    if (resolved) return resolved;
  }
  const textLink = tagValue(block, ['link']);
  if (textLink && !textLink.includes('<')) {
    const resolved = resolveLink(textLink, base);
    if (resolved) return resolved;
  }
  // Some feeds only carry a permalink GUID.
  const guid = tagValue(block, ['guid']);
  if (guid && !/\bisPermaLink\s*=\s*["']false["']/i.test(block)) {
    const resolved = resolveLink(guid, base);
    if (resolved) return resolved;
  }
  return '';
}

function itemDate(block: string): number | null {
  const raw = stripMarkup(tagValue(block, ['pubDate', 'published', 'updated', 'dc:date', 'date']));
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemSummary(block: string): string {
  const raw = tagValue(block, ['description', 'summary', 'content:encoded', 'content']);
  return stripMarkup(raw).slice(0, 240);
}

/**
 * Parses an RSS 2.0 or Atom document. Items without an http(s) link are skipped,
 * because the start page has nothing safe to open for them.
 */
export function parseFeed(xml: string, feedUrl: string): { title: string; items: RssItem[] } {
  if (typeof xml !== 'string' || xml.length === 0 || xml.length > MAX_FEED_BYTES) {
    return { title: '', items: [] };
  }
  const source = xml.replace(/^\uFEFF/, '');

  const channel = /<channel\b[^>]*>([\s\S]*?)<\/channel>/i.exec(source);
  const channelSource = channel?.[1] ?? source;
  const feedTitle = stripMarkup(
    tagValue(channelSource.split(/<(?:item|entry)\b/i)[0] ?? channelSource, ['title']),
  ).slice(0, 120);

  const blocks: string[] = [];
  const pattern = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) && blocks.length < MAX_FEED_ITEMS * 2) {
    blocks.push(match[2] ?? '');
  }

  const items: RssItem[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const url = itemLink(block, feedUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title =
      stripMarkup(tagValue(block, ['title'])).slice(0, 160) || hostOf(url) || url;
    items.push({
      id: url,
      title,
      url,
      summary: itemSummary(block),
      publishedAt: itemDate(block),
    });
    if (items.length >= MAX_FEED_ITEMS) break;
  }

  return { title: feedTitle || feedLabel(feedUrl), items };
}

/**
 * Newest first, deduplicated by URL; undated items keep their feed order after
 * the dated ones. Two feeds often syndicate the same story, so the same link
 * must not appear twice on the start page.
 */
export function mergeFeedItems(items: RssItem[], limit = 8): RssItem[] {
  const seen = new Set<string>();
  return [...items]
    .sort((left, right) => {
      const a = left.publishedAt ?? 0;
      const b = right.publishedAt ?? 0;
      if (a === b) return 0;
      return b - a;
    })
    .filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, limit);
}

/**
 * OPML is a list of `<outline>` elements with `xmlUrl` attributes. Importing a
 * reader's export is the quickest way to move a feed list into Kryvex.
 */
export function parseOpml(text: string): Array<{ title: string; url: string }> {
  if (typeof text !== 'string' || !text) return [];
  const found: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  const pattern = /<outline\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) && found.length < MAX_FEEDS * 4) {
    const attributes = match[1] ?? '';
    const urlMatch = /\bxmlUrl\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    if (!urlMatch) continue;
    const url = normalizeFeedUrl(decodeEntities(urlMatch[1] ?? urlMatch[2] ?? ''));
    if (!url || seen.has(url)) continue;
    const titleMatch = /\b(?:title|text)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    const title = stripMarkup(decodeEntities(titleMatch?.[1] ?? titleMatch?.[2] ?? '')).slice(0, 80);
    seen.add(url);
    found.push({ title: title || feedLabel(url), url });
  }
  return found;
}

/** The persisted shape is user-editable, so everything is checked again. */
export function sanitizeFeeds(raw: unknown): RssFeed[] {
  if (!Array.isArray(raw)) return [];
  const feeds: RssFeed[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const id = String(item.id ?? '').toLowerCase();
    const url = normalizeFeedUrl(item.url);
    if (!/^[a-z0-9-]{1,64}$/.test(id) || !url || ids.has(id) || urls.has(url)) continue;
    const title = typeof item.title === 'string' ? stripMarkup(item.title).slice(0, 80) : '';
    ids.add(id);
    urls.add(url);
    feeds.push({
      id,
      title: title || feedLabel(url),
      url,
      addedAt: Number.isFinite(item.addedAt) ? Number(item.addedAt) : Date.now(),
    });
    if (feeds.length >= MAX_FEEDS) break;
  }
  return feeds;
}
