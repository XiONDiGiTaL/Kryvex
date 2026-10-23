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

/**
 * Desktop notifications are granted only to persistent service modules, and
 * only while the user keeps the setting on. Browser tabs stay denied.
 */
export function isNotificationPermission(permission: string): boolean {
  return permission === 'notifications';
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

/**
 * Chromium's user-agent client hints name the *product*, and Electron's product
 * is "Chromium" rather than "Google Chrome". Kryvex already presents a plain
 * Chrome user agent, so leaving the hints alone makes one browser announce two
 * identities: a stronger fingerprint than either, and one Google's sign-in
 * flow treats as unsupported. Both hint headers are rewritten to the desktop
 * Chrome brand set that matches the user agent Kryvex sends.
 */
/** The `Sec-CH-UA-Platform` vocabulary, from Node's platform name. */
export function clientHintPlatform(platform: string): string {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  return 'Linux';
}

export function withChromeClientHints(
  headers: Record<string, string>,
  chromeVersion: string,
  platform: string = 'Windows',
): Record<string, string> {
  const next = { ...headers };
  const major = (String(chromeVersion).split('.')[0] ?? '').replace(/\D/g, '');
  if (!major) return next;

  const brands = `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not(A:Brand";v="24"`;
  const fullList = `"Google Chrome";v="${major}.0.0.0", "Chromium";v="${major}.0.0.0", "Not(A:Brand";v="24.0.0.0"`;
  const platformValue = `"${platform}"`;

  // Chrome sends the three low-entropy hints on every request. Electron sends
  // none, so they are added rather than only rewritten: a Chrome user agent
  // with no client hints is a combination real Chrome never produces.
  const ua = findHeader(next, 'sec-ch-ua');
  if (ua) next[ua] = brands;
  else next['Sec-CH-UA'] = brands;

  const mobile = findHeader(next, 'sec-ch-ua-mobile');
  if (mobile) next[mobile] = '?0';
  else next['Sec-CH-UA-Mobile'] = '?0';

  const platformHeader = findHeader(next, 'sec-ch-ua-platform');
  if (platformHeader) next[platformHeader] = platformValue;
  else next['Sec-CH-UA-Platform'] = platformValue;

  // Full-version hints are request-only, so they are filled in when a site
  // asked for them and never invented.
  const fullVersion = findHeader(next, 'sec-ch-ua-full-version');
  if (fullVersion) next[fullVersion] = `"${major}.0.0.0"`;
  const fullVersionList = findHeader(next, 'sec-ch-ua-full-version-list');
  if (fullVersionList) next[fullVersionList] = fullList;
  return next;
}
