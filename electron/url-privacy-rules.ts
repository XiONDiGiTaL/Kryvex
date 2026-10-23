/**
 * URL-level privacy rules for top-level navigations.
 *
 * These small, auditable rules cover the two behaviours Electron can
 * reproduce faithfully in `webRequest`: removing known click/campaign
 * identifiers and trying HTTPS before falling back to HTTP.
 */

const TRACKING_PARAMS = new Set([
  '_ga',
  '_gl',
  'ad_id',
  'adgroupid',
  'adset_id',
  'campaign_id',
  'campaignid',
  'dclid',
  'fb_action_ids',
  'fb_action_types',
  'fb_ref',
  'fb_source',
  'fbclid',
  'gbraid',
  'gclid',
  'gclsrc',
  'hsctatracking',
  'igsh',
  'igshid',
  'matomo_campaign',
  'matomo_kwd',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'msclkid',
  'mtm_campaign',
  'mtm_content',
  'mtm_keyword',
  'mtm_medium',
  'mtm_source',
  'oly_anon_id',
  'oly_enc_id',
  'pk_campaign',
  'pk_content',
  'pk_keyword',
  'pk_medium',
  'pk_source',
  'sc_cid',
  'srsltid',
  'ttclid',
  'twclid',
  'vero_id',
  'wbraid',
  'yclid',
]);

const TRACKING_PREFIXES = ['utm_', 'hsa_', '_hsenc', '_hsmi'];

const PRIVATE_HOST =
  /^(?:0\.0\.0\.0|10(?:\.\d{1,3}){3}|127(?:\.\d{1,3}){3}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})$/;

/**
 * Loopback, link-local and RFC 1918 destinations are kept on HTTP. Upgrading
 * them would break routers, printers, local dashboards and development
 * servers, and no public certificate can cover those names.
 */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '0.0.0.0') return true;
  if (host.includes(':')) {
    return host === '::1' || host.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(host);
  }
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  return PRIVATE_HOST.test(host);
}

/** Same registrable-ish site, including a parent/child host pair. */
export function sameSite(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function hasTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Removes known tracking parameters from an http(s) URL. Returns `null` when
 * there is nothing to change, or when the referrer is the same site: those
 * parameters are often functional on same-site GETs.
 */
export function stripTrackingParams(rawUrl: string, referrer?: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.search) return null;

  if (referrer) {
    try {
      const source = new URL(referrer);
      if (source.protocol === 'http:' || source.protocol === 'https:') {
        if (sameSite(source.hostname, url.hostname)) return null;
      }
    } catch {
      /* an invalid referrer must not disable stripping */
    }
  }

  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    if (!hasTrackingParam(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  return changed ? url.toString() : null;
}

/**
 * Upgrades a default-port HTTP URL to HTTPS. Ports, loopback and private
 * destinations are left alone. The caller is responsible for the one-time
 * HTTP fallback when the secure connection fails.
 */
export function upgradeToHttps(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || url.port) return null;
  if (isLocalHost(url.hostname)) return null;
  url.protocol = 'https:';
  return url.toString();
}

/** Stable key for a pending HTTPS attempt; fragments never reach a server. */
export function canonicalUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl.slice(0, 2048);
  }
}
