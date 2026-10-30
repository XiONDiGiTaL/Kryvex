/**
 * Where the page in front is really served from.
 *
 * The browser can name a country for every site it loads only by asking someone
 * who owns an IP registry, so the work happens in the main process: resolve the
 * host, then look the address up once and keep the answer for the session.
 *
 * Everything that decides *what* to ask and *how to read* the answer lives here,
 * without Electron or network access, so the rules are testable on their own.
 */

export type OriginError = 'invalid' | 'local' | 'unresolved' | 'offline' | 'unavailable';

/** One site's serving network, in the shape the chip and card draw. */
export interface ServerOrigin {
  /** The site host the answer belongs to. */
  host: string;
  /** The address DNS gave back, which is what was looked up. */
  address: string;
  version: 4 | 6;
  country: string;
  /** ISO 3166-1 alpha-2, upper case; empty when the registry has none. */
  countryCode: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  /** IANA zone for the server's own clock. */
  timezone: string;
  isp: string;
  org: string;
  asn: number | null;
  lookedUpAt: number;
}

export interface ServerOriginReply {
  ok: boolean;
  error?: OriginError;
  /** Present even on failure, so a late answer can be matched to its tab. */
  host?: string;
  origin?: ServerOrigin;
}

/** A live answer is stable for half a day; a miss is retried within the minute. */
export const ORIGIN_TTL_MS = 12 * 60 * 60 * 1000;
export const ORIGIN_RETRY_MS = 60 * 1000;

const RESERVED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];
const DOCUMENTATION_SUFFIXES = ['.test', '.example', '.invalid'];
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

/**
 * The site a chip describes: a normal hostname with no port, credentials or
 * trailing dot. `null` for anything that is not a web page, including the shell
 * itself and the blank tab.
 */
export function siteHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host.length > 253) return null;
  if (!IPV4.test(host) && !IPV6.test(host) && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return null;
  }
  return host;
}

/** 4, 6 or 0 for "not an address literal". */
export function ipVersion(value: string): 4 | 6 | 0 {
  if (IPV4.test(value)) return 4;
  if (value.includes(':') && IPV6.test(value)) return 6;
  return 0;
}

function ipv4Octets(host: string): number[] | null {
  if (!IPV4.test(host)) return null;
  const parts = host.split('.').map(Number);
  if (parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

/**
 * Addresses that are never worth a registry lookup: loopback, private ranges,
 * link-local, carrier NAT and IPv6 unique-local. They are answered as `local`
 * so the chip can stay quiet about a page served by this machine.
 */
export function isPrivateAddress(host: string): boolean {
  const octets = ipv4Octets(host);
  if (octets) {
    const a = octets[0] ?? 0;
    const b = octets[1] ?? 0;
    if (a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 0) return true;
    return false;
  }
  const address = host.toLowerCase();
  if (address === '::1' || address === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(address)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(address)) return true;
  return false;
}

/** A name that never leaves this machine, or a documentation placeholder. */
export function isLocalHost(host: string): boolean {
  const address = host.toLowerCase();
  if (address === 'localhost') return true;
  if (RESERVED_SUFFIXES.some(suffix => address.endsWith(suffix))) return true;
  if (DOCUMENTATION_SUFFIXES.some(suffix => address.endsWith(suffix))) return true;
  if (ipVersion(address)) return isPrivateAddress(address);
  return false;
}

/** The registry endpoint for one address. Colons stay readable in the path. */
export function lookupUrl(address: string): string {
  return `https://ipwho.is/${address}`;
}

/** Prefers IPv4: registries describe it more completely than IPv6 blocks. */
export function pickAddress<T extends { address: string; family: number }>(addresses: T[]): T | null {
  const clean = addresses.filter(entry => entry && typeof entry.address === 'string' && entry.address);
  return clean.find(entry => entry.family === 4) ?? clean[0] ?? null;
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Reads one ipwho.is answer. A failed lookup reports `success: false` with a
 * message, so only a complete, in-range record becomes a `ServerOrigin`.
 */
export function parseLookup(raw: unknown, host: string): ServerOrigin | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (source.success !== true) return null;

  const address = text(source.ip, 64);
  if (!address) return null;
  const version = ipVersion(address) || (text(source.type, 8) === 'IPv6' ? 6 : 4);

  // Read a little more than two letters: a full name here is not a code and
  // must not be truncated into one.
  const countryCode = text(source.country_code, 8).toUpperCase();
  const country = text(source.country, 80);
  if (!countryCode && !country) return null;

  const connection = (source.connection && typeof source.connection === 'object'
    ? source.connection
    : {}) as Record<string, unknown>;
  const timezone = (source.timezone && typeof source.timezone === 'object'
    ? source.timezone
    : {}) as Record<string, unknown>;

  const latitude = finite(source.latitude);
  const longitude = finite(source.longitude);
  const asn = finite(connection.asn);

  return {
    host,
    address,
    version: version === 6 ? 6 : 4,
    country,
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : '',
    region: text(source.region, 80),
    city: text(source.city, 80),
    latitude: latitude !== null && Math.abs(latitude) <= 90 ? Math.round(latitude * 10000) / 10000 : null,
    longitude: longitude !== null && Math.abs(longitude) <= 180 ? Math.round(longitude * 10000) / 10000 : null,
    timezone: text(timezone.id, 64),
    isp: text(connection.isp, 80),
    org: text(connection.org, 80),
    asn: asn !== null && asn > 0 ? Math.round(asn) : null,
    lookedUpAt: Date.now(),
  };
}
