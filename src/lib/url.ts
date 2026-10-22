import type { SearchEngine, SearchRegion } from '../types';
import { enginesForRegion, searchUrl as engineUrl } from './search-engines';

const HTTP = new Set(['http:', 'https:']);

/** Accepts bare hosts ("notion.so") and returns a normalized https URL. */
export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('Enter a URL.');

  // Reject other schemes before the parser turns "javascript:..." into a host.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error('Only http and https URLs are supported.');
  }
  if (/^(javascript|data|file|mailto|about|blob|vbscript):/i.test(value)) {
    throw new Error('Only http and https URLs are supported.');
  }

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('That does not look like a valid URL.');
  }
  if (!HTTP.has(url.protocol)) throw new Error('Only http and https URLs are supported.');
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    throw new Error('That host is missing a domain, for example example.com.');
  }
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function isHttpUrl(value: string): boolean {
  try {
    return HTTP.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function hostOf(value: string): string {
  try {
    return new URL(value).host.replace(/^www\./, '');
  } catch {
    return value;
  }
}

export function searchUrl(engine: SearchEngine, query: string): string {
  return engineUrl(engine, query);
}

/**
 * Turns the address bar value into a URL, searching when it is not a URL.
 * A regional engine is only used while that region is selected; otherwise the
 * privacy default keeps the address bar working after a region switch.
 */
export function resolveAddress(
  value: string,
  engine: SearchEngine,
  region: SearchRegion = 'global',
): string {
  const trimmed = value.trim();
  if (!trimmed) return 'about:blank';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const looksLikeHost = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(trimmed) || trimmed.startsWith('localhost');
  if (looksLikeHost) {
    try {
      return normalizeUrl(trimmed);
    } catch {
      /* fall through to search */
    }
  }
  const available = enginesForRegion(region).some(item => item.id === engine);
  return searchUrl(available ? engine : 'duckduckgo', trimmed);
}
