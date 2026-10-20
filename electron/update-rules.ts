/**
 * Pure rules for checking Kryvex releases on GitHub.
 *
 * The updater must never trust the network: a release payload is only used
 * after its version, asset names and download hosts have been validated here.
 * Nothing in this module touches Electron or the filesystem, so every rule is
 * unit-tested.
 */

export const UPDATE_OWNER = 'XiONDiGiTaL';
export const UPDATE_REPO = 'Kryvex';
export const UPDATE_RELEASES_API = `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`;
export const UPDATE_RELEASES_PAGE = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`;

const TRUSTED_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

const VERSION_PATTERN = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-([0-9A-Za-z.-]{1,32}))?$/;
const SETUP_PATTERN = /^Kryvex-Setup-(\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?)-x64\.exe$/;
const PORTABLE_PATTERN = /^Kryvex-Portable-(\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?)-x64\.exe$/;
const CHECKSUM_PATTERN = /^SHA256SUMS(?:\.txt)?$/;

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface UpdateRelease {
  version: string;
  tag: string;
  name: string;
  notes: string;
  publishedAt: string;
  pageUrl: string;
  setup: ReleaseAsset | null;
  portable: ReleaseAsset | null;
  checksums: ReleaseAsset | null;
}

export interface ParseOptions {
  /** A local test feed may serve assets from its own origin. */
  devOrigin?: string | null;
}

interface ParsedVersion {
  core: [number, number, number];
  pre: string[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseVersion(value: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : null,
  };
}

export function normalizeVersion(value: string): string | null {
  const parsed = parseVersion(value);
  if (!parsed) return null;
  const base = parsed.core.join('.');
  return parsed.pre ? `${base}-${parsed.pre.join('.')}` : base;
}

function compareIdentifier(a: string, b: string): number {
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);
  if (numericA && numericB) return Number(a) - Number(b);
  if (numericA) return -1;
  if (numericB) return 1;
  return a.localeCompare(b);
}

/** Returns a negative number when `a` is older, 0 when equal, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    const diff = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (diff !== 0) return diff;
  }
  // A prerelease is older than the matching final release.
  if (left.pre && !right.pre) return -1;
  if (!left.pre && right.pre) return 1;
  if (!left.pre || !right.pre) return 0;
  const length = Math.max(left.pre.length, right.pre.length);
  for (let index = 0; index < length; index += 1) {
    const one = left.pre[index];
    const two = right.pre[index];
    if (one === undefined) return -1;
    if (two === undefined) return 1;
    const diff = compareIdentifier(one, two);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isNewer(current: string, candidate: string): boolean {
  return compareVersions(candidate, current) > 0;
}

export function isTrustedAssetUrl(value: unknown, devOrigin?: string | null): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return Boolean(devOrigin) && url.origin === devOrigin && url.protocol === 'http:';
  }
  if (TRUSTED_HOSTS.has(url.hostname.toLowerCase())) return true;
  return url.hostname.toLowerCase().endsWith('.githubusercontent.com');
}

function safeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > 200) return null;
  if (name.includes('/') || name.includes(String.fromCharCode(92)) || name.includes(String.fromCharCode(0))) return null;
  return name;
}

function toAsset(raw: unknown, devOrigin?: string | null): ReleaseAsset | null {
  if (!isRecord(raw)) return null;
  const name = safeName(raw.name);
  const url = raw.browser_download_url;
  const size = Number(raw.size);
  if (!name || !isTrustedAssetUrl(url, devOrigin)) return null;
  if (!Number.isFinite(size) || size < 0 || size > 400 * 1024 * 1024) return null;
  return { name, url, size };
}

/**
 * Parses the GitHub "latest release" payload. Prereleases, drafts, unversioned
 * tags and assets from unknown hosts are rejected rather than guessed at.
 */
export function parseRelease(raw: unknown, options: ParseOptions = {}): UpdateRelease | null {
  if (!isRecord(raw)) return null;
  if (raw.draft === true || raw.prerelease === true) return null;
  const tag = typeof raw.tag_name === 'string' ? raw.tag_name.trim() : '';
  const version = normalizeVersion(tag);
  if (!version) return null;

  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  let setup: ReleaseAsset | null = null;
  let portable: ReleaseAsset | null = null;
  let checksums: ReleaseAsset | null = null;

  for (const entry of assets) {
    const asset = toAsset(entry, options.devOrigin);
    if (!asset) continue;
    if (CHECKSUM_PATTERN.test(asset.name)) {
      checksums ??= asset;
      continue;
    }
    const setupMatch = SETUP_PATTERN.exec(asset.name);
    if (setupMatch && setupMatch[1] === version) {
      setup ??= asset;
      continue;
    }
    const portableMatch = PORTABLE_PATTERN.exec(asset.name);
    if (portableMatch && portableMatch[1] === version) {
      portable ??= asset;
    }
  }

  const notes = typeof raw.body === 'string' ? raw.body.slice(0, 4000) : '';
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 120) : tag;
  const publishedAt = typeof raw.published_at === 'string' ? raw.published_at : '';
  const pageUrl =
    typeof raw.html_url === 'string' && raw.html_url.startsWith(`https://github.com/${UPDATE_OWNER}/`)
      ? raw.html_url
      : UPDATE_RELEASES_PAGE;

  return { version, tag, name, notes, publishedAt, pageUrl, setup, portable, checksums };
}

export function releaseAssetFor(release: UpdateRelease, portable: boolean): ReleaseAsset | null {
  return portable ? release.portable : release.setup;
}

/** Parses `sha256sum` output, which uses two spaces or a `*` before the name. */
export function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (!match) continue;
    const name = safeName(match[2]);
    if (!name) continue;
    map.set(name.toLowerCase(), (match[1] ?? '').toLowerCase());
    if (map.size >= 100) break;
  }
  return map;
}

export function checksumFor(map: Map<string, string>, filename: string): string | null {
  return map.get(filename.toLowerCase()) ?? null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = value >= 10 || unit === 0 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1);
  return `${shown} ${units[unit]}`;
}
