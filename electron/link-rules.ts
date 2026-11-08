/**
 * Rules for Kryvex Link, the phone companion.
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

/** One adapter address, ready to render: the URL plus what it belongs to. */
export interface LinkAddressEntry {
  url: string;
  address: string;
  name: string;
  /** False for an adapter a phone almost certainly cannot reach. */
  likely: boolean;
}

/**
 * Adapter names Windows gives a machine that is not on the user's own network.
 *
 * The address list is where a phone-link setup usually goes wrong: the first
 * private IPv4 on a laptop can be a VirtualBox host-only adapter or a VPN
 * tunnel, and typing that into a phone produces a page that never loads. These
 * names are matched only to order and label the list — nothing is hidden, so a
 * user who really does want the VPN address can still type it.
 */
const VIRTUAL_ADAPTER =
  /virtual|vmware|virtualbox|hyper-v|vethernet|loopback|docker|wsl|tailscale|zerotier|hamachi|\btun\b|\btap\b|bluetooth|npcap/i;

export function isVirtualAdapter(name: string): boolean {
  return VIRTUAL_ADAPTER.test(name);
}

/**
 * Addresses with their adapter names, ranked so the reachable one comes first.
 *
 * Order: a private address on a real adapter, then a private address on a
 * virtual one, then anything else (loopback last). Duplicates collapse, and the
 * URL is built here so the view never assembles one.
 */
export function describeLinkAddresses(
  rows: Array<{ address: string; name: string }>,
  port: number,
): LinkAddressEntry[] {
  const seen = new Set<string>();
  const entries: Array<LinkAddressEntry & { rank: number }> = [];
  for (const row of rows) {
    const address = typeof row?.address === 'string' ? row.address.trim() : '';
    if (!address || seen.has(address)) continue;
    seen.add(address);
    const name = typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : 'Network';
    const privateAddress = isPrivateAddress(address) && !address.startsWith('127.');
    const likely = privateAddress && !isVirtualAdapter(name);
    entries.push({
      address,
      name,
      url: linkUrl(address, port),
      likely,
      rank: likely ? 0 : privateAddress ? 1 : 2,
    });
  }
  return entries.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...entry }) => entry);
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

/**
 * The battery a phone reports about itself.
 *
 * A page can read `navigator.getBattery()`, which makes this the one piece of
 * device state a paired phone can offer without a native app. It is validated
 * like everything else the phone sends: a level outside 0..1 is clamped, and a
 * malformed payload is dropped rather than shown as an alarming 0%.
 */
export interface LinkPhoneStatus {
  level: number;
  charging: boolean;
}

export function phoneStatus(raw: unknown): LinkPhoneStatus | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as { level?: unknown; charging?: unknown };
  if (typeof data.level !== 'number' || !Number.isFinite(data.level)) return null;
  return {
    level: Math.min(1, Math.max(0, data.level)),
    charging: data.charging === true,
  };
}

/** How many networks outside the local subnet the rule may also cover. */
export const LINK_MAX_SCOPES = 8;

/**
 * A network a phone might be on, as a firewall scope.
 *
 * The rule this app writes is scoped to `LocalSubnet`, which is the wrong scope
 * for the case that actually fails: a laptop on Ethernet and a phone on Wi-Fi
 * are usually one network, but plenty of routers put the two segments on
 * different subnets (a guest SSID, a per-band subnet, a mesh node). The router
 * routes between them and Windows still drops the packet, because the rule's
 * remote scope does not include the phone's network.
 *
 * This string ends up in an elevated `netsh` command line, so it is parsed here
 * and nowhere else: four octets, a private range only, a prefix between /8 and
 * /32, and no characters beyond digits, dots and one slash. A bare address is
 * a /32, which is what a phone with a fixed lease needs; the /24 form is what a
 * phone whose address moves needs.
 */
export function parseNetworkScope(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 18) return null;
  const slash = value.indexOf('/');
  const host = slash === -1 ? value : value.slice(0, slash);
  const prefix = slash === -1 ? '' : value.slice(slash + 1);
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  if (!parts.every(part => /^\d{1,3}$/.test(part) && String(Number(part)) === part && Number(part) <= 255)) {
    return null;
  }
  const octets = parts.map(Number) as [number, number, number, number];
  const [a, b] = octets;
  const privateHost =
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127);
  if (!privateHost) return null;
  if (slash !== -1 && !/^\d{1,2}$/.test(prefix)) return null;
  const bits = slash === -1 ? 32 : Number(prefix);
  if (bits < 8 || bits > 32) return null;
  return `${octets.join('.')}/${bits}`;
}

/**
 * The scopes the rule should carry: what it covers already, then what was typed.
 *
 * A narrower prefix is a different scope, so both survive; a repeat collapses.
 * Anything that fails the parser is dropped, which is what keeps a typed string
 * out of the command line below.
 */
export function mergeNetworkScopes(existing: unknown, extra: unknown): string[] {
  const scopes: string[] = [];
  for (const list of [existing, extra]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const scope = parseNetworkScope(item);
      if (!scope || scopes.includes(scope)) continue;
      scopes.push(scope);
      if (scopes.length >= LINK_MAX_SCOPES) return scopes;
    }
  }
  return scopes;
}

/** `LocalSubnet` plus the extra networks, which is what `netsh` takes. */
export function ruleRemoteAddresses(scopes: unknown): string {
  return ['LocalSubnet', ...mergeNetworkScopes(scopes, [])].join(',');
}

/** What a rule's remote-address filter covers. */
export interface LinkRuleScope {
  localSubnet: boolean;
  subnets: string[];
}

/**
 * What `Get-NetFirewallAddressFilter -ExpandProperty RemoteAddress` printed.
 *
 * A missing rule prints nothing, which reads as "covers nothing" rather than as
 * an error: the caller already knows from the same reading whether a rule is
 * there. A scope this parser cannot represent is left out instead of guessed.
 */
export function parseRemoteAddresses(raw: unknown): LinkRuleScope {
  const scope: LinkRuleScope = { localSubnet: false, subnets: [] };
  if (typeof raw !== 'string') return scope;
  for (const entry of raw.split(/[,\r\n]+/)) {
    const value = entry.trim();
    if (!value) continue;
    if (/^local\s*subnet$/i.test(value)) {
      scope.localSubnet = true;
      continue;
    }
    const network = parseNetworkScope(value);
    if (network && !scope.subnets.includes(network)) scope.subnets.push(network);
  }
  return scope;
}

/** The Windows firewall rule this app creates for the link's port range. */
export const LINK_RULE_NAME = 'Kryvex Link';

/**
 * What the firewall says, in the terms that change what the user does: the link
 * is reachable, a rule exists but is switched off, or no rule exists at all.
 *
 * Both readings are tri-state because `Get-NetFirewallRule` prints nothing when
 * there is no rule and PowerShell may not answer at all. `unknown` is a real
 * answer: the app says it cannot tell rather than claiming the network is fine.
 */
export type FirewallVerdict = 'open' | 'rule-disabled' | 'no-rule' | 'unknown';

export function parseFirewallReading(
  rule: string,
  profile: string,
): { ruleEnabled: boolean | null; privateFiltering: boolean | null } {
  const tri = (value: string): boolean | null => {
    const text = value.trim().toLowerCase();
    if (text === 'true') return true;
    if (text === 'false') return false;
    return null;
  };
  return { ruleEnabled: tri(rule), privateFiltering: tri(profile) };
}

/**
 * `privateFiltering === false` means Windows is not filtering inbound traffic on
 * the private profile at all, so a missing rule cannot be the cause.
 */
export function firewallVerdict(reading: {
  ruleEnabled: boolean | null;
  privateFiltering: boolean | null;
}): FirewallVerdict {
  if (reading.privateFiltering === false) return 'open';
  if (reading.ruleEnabled === null) return reading.privateFiltering === null ? 'unknown' : 'no-rule';
  return reading.ruleEnabled ? 'open' : 'rule-disabled';
}
