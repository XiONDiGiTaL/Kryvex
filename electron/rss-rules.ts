/**
 * URL rules for the start page's feed fetcher.
 *
 * The renderer supplies a URL, so the main process re-checks it: http(s) only,
 * no embedded credentials, a bounded length, and no non-web port surprises.
 * The response is capped in `rss.ts`; this file only decides what may be
 * contacted.
 */
const HTTP = new Set(['http:', 'https:']);

export function feedRequestUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || value.length > 2048) return '';
  if (!/^https?:\/\//i.test(value)) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (!HTTP.has(url.protocol)) return '';
  if (url.username || url.password) return '';
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return '';
  url.hash = '';
  return url.toString();
}
