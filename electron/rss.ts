import { net } from 'electron';
import { feedRequestUrl } from './rss-rules';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

export interface FeedFetchResult {
  ok: boolean;
  text: string;
  url: string;
  error?: 'invalid-url' | 'unavailable' | 'too-large' | 'not-feed';
}

/**
 * Fetches one feed for the browser start page.
 *
 * The main process does the request so the renderer is not subject to CORS and
 * can read public feeds that do not send permissive headers. Nothing about the
 * profile is sent: one GET, a generic user agent, and the feed's own URL.
 */
export async function fetchFeed(raw: unknown): Promise<FeedFetchResult> {
  const url = feedRequestUrl(raw);
  if (!url) return { ok: false, text: '', url: '', error: 'invalid-url' };

  let response: Response;
  try {
    response = await net.fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
        'User-Agent': 'Kryvex/0.8 (+https://github.com/XiONDiGiTaL/Kryvex)',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, text: '', url, error: 'unavailable' };
  }

  if (!response.ok) {
    return { ok: false, text: '', url: response.url || url, error: 'unavailable' };
  }
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return { ok: false, text: '', url: response.url || url, error: 'too-large' };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch {
    return { ok: false, text: '', url: response.url || url, error: 'unavailable' };
  }
  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, text: '', url: response.url || url, error: 'too-large' };
  }

  const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  if (!/<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 4096))) {
    return { ok: false, text: '', url: response.url || url, error: 'not-feed' };
  }
  return { ok: true, text, url: response.url || url };
}
