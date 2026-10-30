import type { OriginError, ServerOrigin } from '../../electron/types';

/**
 * How the origin chip reads a reply.
 *
 * The main process answers with raw registry values; these helpers turn them
 * into what a person reads: a flag, a country in their own language, the
 * server's clock and its coordinates. They stay pure and localisable so the
 * component holds only state, and so the labels can be tested.
 */

/** The http(s) host of a page, without `www`, port or brackets. */
export function publicHost(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host) return '';
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Bundled flag file for an ISO code, or empty when the code is unusable. */
export function flagSrc(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return `flags/${code.toLowerCase()}.svg`;
}

const countries = new Map<string, Intl.DisplayNames | null>();

/** "Deutschland", "Germany" or the bare code, whichever the runtime can give. */
export function countryLabel(code: string, locale: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  const key = locale || 'en';
  if (!countries.has(key)) {
    try {
      countries.set(key, new Intl.DisplayNames([key], { type: 'region' }));
    } catch {
      countries.set(key, null);
    }
  }
  try {
    return countries.get(key)?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** The network owner, with the AS number when the registry knows it. */
export function networkLabel(origin: Pick<ServerOrigin, 'isp' | 'org' | 'asn'>): string {
  const owner = origin.isp || origin.org;
  if (owner && origin.asn) return `${owner} · AS${origin.asn}`;
  if (owner) return owner;
  if (origin.asn) return `AS${origin.asn}`;
  return '';
}

/** City and region, or whichever of the two the registry filled in. */
export function nodeLabel(origin: Pick<ServerOrigin, 'city' | 'region'>): string {
  return [origin.city, origin.region].filter(Boolean).join(', ');
}

/** "27.47° N, 153.03° E"; empty when the registry gave no point. */
export function coordinateLabel(latitude: number | null, longitude: number | null): string {
  if (latitude === null || longitude === null) return '';
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  const north = latitude >= 0 ? 'N' : 'S';
  const east = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(2)}° ${north}, ${Math.abs(longitude).toFixed(2)}° ${east}`;
}

/** The server's own wall clock, in the reader's locale and 24-hour form. */
export function clockAt(timezone: string, locale: string, now: number = Date.now()): string {
  if (!timezone) return '';
  try {
    return new Intl.DateTimeFormat(locale || 'en', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
  } catch {
    return '';
  }
}

/** Short age of a cached answer: "just now", "4 min", "3 h", "2 d". */
export function ageLabel(at: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** One line for a chip that could not resolve, keyed by the main process reason. */
export function originProblem(error: OriginError | undefined): string {
  switch (error) {
    case 'local':
      return 'Served from this machine, so there is no country to show.';
    case 'unresolved':
      return 'The host name did not resolve to an address.';
    case 'offline':
      return 'The origin service could not be reached.';
    case 'invalid':
      return 'This page has no address to look up.';
    default:
      return 'The registry had no record for this address.';
  }
}
