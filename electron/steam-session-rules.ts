/**
 * Rules for keeping a Steam module signed in.
 *
 * Steam's web login writes some of its auth cookies as session cookies. A
 * persistent Electron partition still drops those at exit, so a wrapper that
 * only sets `persist:…` asks for Steam Guard again on every launch. These
 * helpers identify the Steam session and decide which cookies are safe to
 * promote to a normal, expiring cookie.
 *
 * Only the Steam partition ever runs this; other services keep Chromium's
 * default session-cookie behaviour.
 */

const STEAM_HOSTS = ['steamcommunity.com', 'steampowered.com'];

/** A year, matching Steam's own long-lived "remember this computer" auth. */
export const STEAM_SESSION_DAYS = 365;

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** True when a service URL points at a Steam web client that we keep signed in. */
export function isSteamSessionUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return STEAM_HOSTS.some(domain => hostMatches(url.hostname.toLowerCase(), domain));
  } catch {
    return false;
  }
}

/** Cookie domains arrive with a leading dot for domain-wide cookies. */
export function isSteamCookieDomain(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  const domain = raw.replace(/^\./, '').toLowerCase();
  return STEAM_HOSTS.some(candidate => hostMatches(domain, candidate));
}

/** Expiry in whole seconds, which is what Electron's cookie API expects. */
export function steamCookieExpiry(nowMs: number, days = STEAM_SESSION_DAYS): number {
  return Math.floor(nowMs / 1000) + Math.max(1, Math.floor(days)) * 86_400;
}
