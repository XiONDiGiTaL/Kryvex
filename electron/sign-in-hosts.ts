/**
 * Google's own hosts, and the two rules that depend on them.
 *
 * Google's account pages carry an account-protection script, and that script
 * treats a browser whose native functions or client hints have been wrapped as
 * unsafe: a Chrome-claiming page is refused with "This browser or app may not
 * be secure". Kryvex reports its own product agent to Google instead — the only
 * identity Google's check has accepted in measurement — so the whole Google
 * family, account pages and products alike, is kept away from farbling.
 *
 * The second rule is about consistency. A sign-in does not stay on
 * `accounts.google.com`: it starts on the product (Gmail, YouTube), redirects to
 * the account host for the password, and comes back. A browser that changes
 * product halfway through that flow is easy to read as two different browsers,
 * so the identity is chosen per *site family* — Google hosts get one identity
 * from the first request to the last, and everything else keeps the Chrome one.
 */

/** Google's domains and the CDNs its pages load their own script from. */
const GOOGLE_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'ytimg.com',
  'googlevideo.com',
  'googleusercontent.com',
  'gstatic.com',
  'googleapis.com',
  'ggpht.com',
  'withgoogle.com',
];

/**
 * Strips a port and any userinfo, so a probe that passes an authority still
 * gets the same answer as one that passes a bare hostname.
 */
function normalizeHost(rawHost: string): string {
  if (typeof rawHost !== 'string' || !rawHost) return '';
  return rawHost
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/^.*@/, '')
    .replace(/:\d+$/, '');
}

/** Google's account hosts use at most two labels after the brand. */
function isBrandTail(labels: string[]): boolean {
  if (labels.length < 1 || labels.length > 2) return false;
  return labels.every(label => /^[a-z]{2,6}$/i.test(label));
}

export function isSignInHost(rawHost: string): boolean {
  const host = normalizeHost(rawHost);
  if (!host) return false;

  const labels = host.split('.');
  if (labels.length < 3) return false;
  const [first, brand] = labels;

  if (brand === 'google' && (first === 'accounts' || first === 'myaccount')) {
    return isBrandTail(labels.slice(2));
  }
  // The YouTube account chooser is the same sign-in surface under another
  // brand label.
  if (brand === 'youtube' && first === 'accounts') {
    return isBrandTail(labels.slice(2));
  }
  return false;
}

/**
 * Every host Google serves its own product or account pages from, including
 * `google.com` under a country domain (`google.co.uk`, `google.com.au`).
 */
export function isGoogleSite(rawHost: string): boolean {
  const host = normalizeHost(rawHost);
  if (!host) return false;

  // A brand label somewhere inside the name only counts when everything after
  // it is a plausible public suffix; `google.com.evil.test` fails that test.
  const labels = host.split('.');
  const brand = labels.indexOf('google');
  if (brand >= 0 && isBrandTail(labels.slice(brand + 1))) return true;

  return GOOGLE_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
}
