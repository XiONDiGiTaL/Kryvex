/**
 * Pure privacy rules used by the main process and covered by unit tests.
 *
 * These are Kryvex rules, not Firefox preferences: LibreWolf is a Firefox
 * derivative, so its user.js cannot be dropped into Chromium. The goals that
 * do translate are implemented with Electron's own session APIs.
 */

/** Service modules persist; browser tabs are in-memory and disposable. */
const SAFE_PARTITION = /^(persist:svc-[a-z0-9-]{1,64}|browser-[a-z0-9-]{1,64})$/i;

const PRIVACY_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);

export type MediaDevice = 'microphone' | 'camera';

export function isSafePartition(value: string): boolean {
  return SAFE_PARTITION.test(value);
}

export function isPrivacyPermission(permission: string): boolean {
  return PRIVACY_PERMISSIONS.has(permission);
}

/** Media access is never automatic; it goes through the user prompt. */
export function isMediaPermission(permission: string): boolean {
  return permission === 'media';
}

/** Maps Chromium's mediaTypes (or an absent list) to user-facing devices. */
export function mediaDevices(types: readonly string[] | undefined): MediaDevice[] {
  if (!types || types.length === 0) return ['microphone', 'camera'];
  const devices: MediaDevice[] = [];
  if (types.includes('audio')) devices.push('microphone');
  if (types.includes('video')) devices.push('camera');
  return devices;
}

/** Only normal web origins may receive a media grant. */
export function isHttpOrigin(value: string | undefined): value is string {
  return normalizeHttpOrigin(value) !== null;
}

/** Returns a canonical scheme/host/port origin, or null for non-web URLs. */
export function normalizeHttpOrigin(value: string | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.keys(headers).find(key => key.toLowerCase() === lower);
}

/**
 * LibreWolf trims cross-origin referrers to scheme, host and port. Only an
 * existing Referer is rewritten: a missing header may be the result of a
 * site's `Referrer-Policy`, and re-adding it would weaken that choice.
 */
export function trimCrossOriginReferrer(
  requestUrl: string,
  referrer: string | undefined,
): string | undefined {
  if (!referrer) return undefined;
  try {
    const target = new URL(requestUrl);
    const source = new URL(referrer);
    if (source.protocol !== 'http:' && source.protocol !== 'https:') return undefined;
    if (source.origin === target.origin) return undefined;
    return `${source.origin}/`;
  } catch {
    return undefined;
  }
}

/**
 * Adds the Global Privacy Control signal, trims cross-origin Referer values
 * and removes Chromium's experiment-cohort header. Header names are matched
 * case-insensitively because wire casing is not guaranteed.
 */
export function withPrivacyHeaders(
  headers: Record<string, string>,
  requestUrl: string,
): Record<string, string> {
  const next = { ...headers };

  if (!findHeader(next, 'sec-gpc')) next['Sec-GPC'] = '1';

  const referer = findHeader(next, 'referer');
  if (referer) {
    const trimmed = trimCrossOriginReferrer(requestUrl, next[referer]);
    if (trimmed) next[referer] = trimmed;
  }

  const clientData = findHeader(next, 'x-client-data');
  if (clientData) delete next[clientData];

  return next;
}
