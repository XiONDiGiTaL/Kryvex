/**
 * The tools Vexium may actually use when it does not know something.
 *
 * A local model that answers "I cannot browse the web" is not being cautious,
 * it is being useless: the refusal is the only register it has. These are real
 * tools the main process runs on the user's behalf — a web search, one page
 * read, arithmetic and the clock — so the model can say "I looked it up"
 * truthfully and cite what it read.
 *
 * Everything here is deliberately small and bounded:
 *
 * - A search returns at most `SEARCH_LIMIT` results, and one page read yields
 *   at most `PAGE_TEXT_LIMIT` characters. A 12B model with a 4k window cannot
 *   digest more, and the loop could otherwise grow without bound.
 * - Requests only go to the public internet: loopback, link-local, private
 *   ranges, `.local` names and bare hostnames that resolve into those ranges
 *   are refused after DNS, not merely by pattern. A model asking to "fetch
 *   http://192.168.1.1" must not be able to use the assistant as a probe.
 * - Nothing is written to disk and nothing is kept: a result exists for the
 *   duration of one answer.
 * - The calculator is a parser, not `eval`: digits, `+ - * / % ^ ( ) .`, and
 *   nothing else.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

export type ToolName = 'search' | 'fetch' | 'calculate' | 'clock';

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface PageRead {
  url: string;
  title: string;
  text: string;
}

export const SEARCH_LIMIT = 4;
export const PAGE_TEXT_LIMIT = 4_000;
export const PAGE_BYTES_LIMIT = 600_000;
export const SEARCH_TIMEOUT_MS = 12_000;
export const PAGE_TIMEOUT_MS = 12_000;
export const MAX_QUERY_LENGTH = 240;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** A query the model may send: one line, printable, bounded. */
export function sanitizeQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > MAX_QUERY_LENGTH) return null;
  return text;
}

/** The search endpoint: DuckDuckGo's HTML page, no key and no account. */
export function searchUrl(query: string): string {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

/** DuckDuckGo wraps results in a redirect; the real target is in `uddg`. */
export function unwrapDuckDuckGo(href: string): string | null {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    const resolved = target ? new URL(target) : url;
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return null;
    if (resolved.hostname.endsWith('duckduckgo.com')) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#x27': "'",
  '#x2F': '/',
  '#8217': '’',
  '#8216': '‘',
  '#8220': '“',
  '#8221': '”',
  '#8230': '…',
  '#8211': '–',
  '#8212': '—',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#?[0-9a-zA-Z]+);/g, (match, name: string) => {
    const key = name.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key]!;
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

/** The readable titles, links and snippets out of DuckDuckGo's HTML page. */
export function parseSearchPage(html: string, limit = SEARCH_LIMIT): WebResult[] {
  const results: WebResult[] = [];
  const pattern =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/g;
  for (const match of html.matchAll(pattern)) {
    if (results.length >= limit) break;
    const url = unwrapDuckDuckGo(decodeEntities(match[1] ?? ''));
    if (!url) continue;
    const title = decodeEntities(match[2] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const snippet = decodeEntities(match[3] ?? match[4] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) continue;
    if (results.some(result => result.url === url)) continue;
    results.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 320) });
  }
  return results;
}

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

/** Whether an address is one this process must never dial on the model's behalf. */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return PRIVATE_V4.some(pattern => pattern.test(address)) || address === '255.255.255.255';
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return false;
  }
  return true;
}

/** A URL worth reading: http(s), no credentials, a public name. */
export function sanitizePageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > 500) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return null;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return null;
  if (net.isIP(host) && isPrivateAddress(host)) return null;
  if (!host.includes('.') && !net.isIP(host)) return null;
  return url.toString();
}

async function assertPublicHost(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) return false;
    return records.every(record => !isPrivateAddress(record.address));
  } catch {
    return false;
  }
}

async function request(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal,
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      'accept-language': 'en-US,en;q=0.8,tr;q=0.7',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/** Search the public web. Resolves to at most `limit` results, or throws. */
export async function searchWeb(
  query: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<WebResult[]> {
  const clean = sanitizeQuery(query);
  if (!clean) throw new Error('bad-query');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);
  try {
    const response = await request(searchUrl(clean), controller.signal);
    const html = (await response.text()).slice(0, 900_000);
    return parseSearchPage(html, options.limit ?? SEARCH_LIMIT);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Visible text of an HTML document: scripts, styles and tags removed. */
export function htmlToText(html: string): string {
  const withoutHead = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = withoutHead
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function pageTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return decodeEntities(match?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Read one page. The model never receives the whole document: the first
 * `PAGE_TEXT_LIMIT` characters are what fits beside its own prompt, and a page
 * that says nothing useful is reported as such instead of padding the context.
 */
export async function fetchPage(
  rawUrl: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<PageRead> {
  const url = sanitizePageUrl(rawUrl);
  if (!url) throw new Error('bad-url');
  const parsed = new URL(url);
  if (!(await assertPublicHost(parsed.hostname))) throw new Error('private-host');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);
  try {
    const response = await request(url, controller.signal);
    const type = response.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new Error('not-text');
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, PAGE_BYTES_LIMIT));
    const text = htmlToText(html);
    return {
      url: response.url || url,
      title: pageTitle(html),
      text: text.slice(0, options.limit ?? PAGE_TEXT_LIMIT),
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Arithmetic, parsed.
 *
 * The model is told to use this rather than guess, so the failure mode has to
 * be "this is not arithmetic", never an exception escaping into the answer:
 * everything unparsable, including anything with a letter in it, returns null.
 */
export function calculate(expression: unknown): number | null {
  if (typeof expression !== 'string') return null;
  const source = expression.replace(/\s+/g, '');
  if (!source || source.length > 120) return null;
  if (!/^[0-9.+\-*/%^()]+$/.test(source)) return null;

  let index = 0;
  const eat = (char: string) => {
    if (source[index] !== char) return false;
    index += 1;
    return true;
  };

  const parseNumber = (): number | null => {
    const start = index;
    while (index < source.length && /[0-9.]/.test(source[index]!)) index += 1;
    if (start === index) return null;
    const value = Number(source.slice(start, index));
    return Number.isFinite(value) ? value : null;
  };

  const parsePrimary = (): number | null => {
    if (eat('(')) {
      const value = parseExpression();
      if (value === null || !eat(')')) return null;
      return value;
    }
    if (eat('-')) {
      const value = parsePrimary();
      return value === null ? null : -value;
    }
    if (eat('+')) return parsePrimary();
    return parseNumber();
  };

  const parsePower = (): number | null => {
    const base = parsePrimary();
    if (base === null) return null;
    if (!eat('^')) return base;
    const exponent = parsePower();
    if (exponent === null) return null;
    const value = base ** exponent;
    return Number.isFinite(value) ? value : null;
  };

  const parseTerm = (): number | null => {
    let value = parsePower();
    if (value === null) return null;
    for (;;) {
      if (eat('*')) {
        const right = parsePower();
        if (right === null) return null;
        value *= right;
      } else if (eat('/')) {
        const right = parsePower();
        if (right === null || right === 0) return null;
        value /= right;
      } else if (eat('%')) {
        const right = parsePower();
        if (right === null || right === 0) return null;
        value %= right;
      } else {
        return value;
      }
    }
  };

  const parseExpression = (): number | null => {
    let value = parseTerm();
    if (value === null) return null;
    for (;;) {
      if (eat('+')) {
        const right = parseTerm();
        if (right === null) return null;
        value += right;
      } else if (eat('-')) {
        const right = parseTerm();
        if (right === null) return null;
        value -= right;
      } else {
        return value;
      }
    }
  };

  const result = parseExpression();
  if (result === null || index !== source.length || !Number.isFinite(result)) return null;
  return result;
}

/** The model is given the date; it must not guess it. */
export function clock(now = new Date(), locale = 'en-GB'): string {
  return `${now.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })} ${now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
}
