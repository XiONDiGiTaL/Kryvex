/**
 * Rules for Kyvex Link, the phone companion.
 *
 * Kryvex serves one small page on the local network so a phone can pair with it
 * and exchange clipboard text, files and remote-control commands. Everything in
 * this module is pure: the ports, the pairing code, the token shape, the address
 * range that may connect, the file-name rewriting and the command allowlist can
 * all be tested without Electron or a socket. The server in `link-server.ts`
 * makes no policy decisions of its own.
 *
 * The threat model is a shared network: the page is reachable by anyone on the
 * same Wi-Fi, so every route except the two that pair a device needs a token,
 * a token is only ever minted against a live pairing code, and a request from
 * outside the private ranges is refused before it is read.
 */

export type LinkCommand =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'volume-up'
  | 'volume-down'
  | 'mute'
  | 'focus'
  | 'rooms'
  | 'home';

export const LINK_COMMANDS: readonly LinkCommand[] = [
  'play',
  'pause',
  'next',
  'previous',
  'volume-up',
  'volume-down',
  'mute',
  'focus',
  'rooms',
  'home',
];

export function isLinkCommand(value: unknown): value is LinkCommand {
  return typeof value === 'string' && (LINK_COMMANDS as readonly string[]).includes(value);
}

/**
 * A short window of ports: the first free one wins, so a second Kryvex profile
 * (or something else that already holds 43110) does not stop the link starting.
 */
export const LINK_PORT_FIRST = 43110;
export const LINK_PORT_LAST = 43129;

/** Six digits, shown on the desktop and typed on the phone. */
export const LINK_CODE_LENGTH = 6;

/** A code lives for five minutes; asking for a new one retires the old. */
export const LINK_CODE_TTL_MS = 5 * 60 * 1000;

/** Guessing is rate-limited per address, not per code. */
export const LINK_PAIR_WINDOW_MS = 60 * 1000;
export const LINK_PAIR_ATTEMPTS = 5;

/** A pair list is a list of devices the user owns, not a fleet. */
export const LINK_MAX_DEVICES = 8;

/** Clipboard text is capped: the phone keyboard is not a file transfer. */
export const LINK_MAX_TEXT = 100_000;
export const LINK_MAX_URL = 2_048;
export const LINK_MAX_LABEL = 40;
export const LINK_MAX_NAME = 120;
export const LINK_MAX_UPLOAD = 256 * 1024 * 1024;
/** How many received and offered files the view keeps, newest first. */
export const LINK_MAX_FILES = 200;

export type LinkEventName =
  | 'hello'
  | 'clipboard'
  | 'notice'
  | 'file'
  | 'devices'
  | 'remote'
  | 'error';

export const LINK_EVENT_NAMES: readonly LinkEventName[] = [
  'hello',
  'clipboard',
  'notice',
  'file',
  'devices',
  'remote',
  'error',
];

export function isLinkEventName(value: unknown): value is LinkEventName {
  return typeof value === 'string' && (LINK_EVENT_NAMES as readonly string[]).includes(value);
}

/**
 * A six-digit code from a random source. Injected so a test can pin the digits;
 * the service passes `crypto.randomInt`, which is uniform and unpredictable.
 */
export function makePairCode(digit: (max: number) => number = max => Math.floor(Math.random() * max)): string {
  let code = '';
  for (let index = 0; index < LINK_CODE_LENGTH; index += 1) code += String(digit(10));
  return code;
}

/**
 * What the user typed, after a keyboard that adds spaces and dashes: digits
 * only, and only a full-length code is ever compared.
 */
export function normalizePairCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === LINK_CODE_LENGTH ? digits : null;
}

export function isValidPairCode(raw: unknown): raw is string {
  return typeof raw === 'string' && new RegExp(`^\\d{${LINK_CODE_LENGTH}}$`).test(raw);
}

/** A device token: opaque, 48 hex characters, never derived from anything. */
export function isLinkToken(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[0-9a-f]{48}$/.test(raw);
}

/**
 * Whether a connection came from this machine or the local network.
 *
 * The companion is meant for the phone on the same Wi-Fi, so a public source
 * address means either a NAT rule that the user did not create or a mistaken
 * bind. Either way the request is refused. Private ranges are the four RFC 1918
 * blocks, carrier-grade NAT, link-local, loopback, and their IPv6 equivalents.
 */
export function isPrivateAddress(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  // Node reports an IPv4-mapped IPv6 peer as `::ffff:192.168.1.5`.
  const address = raw.trim().toLowerCase().replace(/^::ffff:/, '');
  if (!address) return false;
  if (address === '::1' || address === '::') return true;

  const v4 = address.split('.');
  if (v4.length === 4 && v4.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    const [a, b] = v4.map(Number) as [number, number, number, number];
    if (a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  // IPv6: unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(address)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(address)) return true;
  return false;
}

/**
 * A file name that is safe to join to a directory.
 *
 * The phone chooses this string, so it must not be able to name a parent
 * directory, a drive, an alternate data stream or a reserved device. Anything
 * that survives is a single path segment with no separators or control
 * characters, which is what makes `path.join(inbox, name)` trustworthy.
 */
export function safeFileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // A browser may percent-encode a name inside the query string.
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  value = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    // A decoded `..%2f` or `:` leaves a leading dash; a name never starts there.
    .replace(/^[\s.-]+/, '')
    .replace(/[. ]+$/, '');
  if (!value) return null;
  const stem = value.includes('.') ? value.slice(0, value.lastIndexOf('.')) : value;
  // Windows reserves these names with any extension (`CON.txt` is still CON).
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) return `file-${value}`;
  const capped = value.length > LINK_MAX_NAME ? value.slice(0, LINK_MAX_NAME) : value;
  return capped || null;
}

/**
 * `photo.jpg` becomes `photo (2).jpg` when taken, keeping the extension so the
 * receiving app still opens it.
 */
export function uniqueFileName(taken: Iterable<string>, name: string): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem} (${index})${extension}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${extension}`;
}

/** Only a plain web page can be handed to the browser; nothing else is opened. */
export function linkableUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > LINK_MAX_URL) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function clampText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.replace(/\r\n/g, '\n');
  return trimmed.length > LINK_MAX_TEXT ? trimmed.slice(0, LINK_MAX_TEXT) : trimmed;
}

/** The name a paired phone shows in the desktop's device list. */
export function deviceLabel(raw: unknown, fallback = 'Phone'): string {
  if (typeof raw !== 'string') return fallback;
  const flat = raw.replace(/\s+/g, ' ').trim();
  if (!flat) return fallback;
  return flat.length > LINK_MAX_LABEL ? flat.slice(0, LINK_MAX_LABEL) : flat;
}

/**
 * Which addresses the desktop advertises.
 *
 * A loopback address is useless to a phone, so it is offered last: the QR code
 * carries the first LAN address, and the rest are listed as fallbacks for a
 * machine with several adapters (Wi-Fi, Ethernet, a VPN).
 */
export function rankLinkAddresses(addresses: string[]): string[] {
  const seen = new Set<string>();
  const lan: string[] = [];
  const other: string[] = [];
  for (const address of addresses) {
    if (seen.has(address)) continue;
    seen.add(address);
    if (isPrivateAddress(address) && !address.startsWith('127.')) lan.push(address);
    else other.push(address);
  }
  return [...lan, ...other];
}

export function linkUrl(host: string, port: number, path = '/'): string {
  return `http://${host}:${port}${path}`;
}

/** A short, human description of an inbound request for the activity list. */
export function describeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : Math.round(value * 10) / 10} ${units[unit]}`;
}
