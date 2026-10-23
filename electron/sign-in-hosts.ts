/**
 * Google's own sign-in pages.
 *
 * Those pages carry Google's account-protection script, and that script treats
 * a browser whose native functions or client hints have been wrapped as
 * unsafe: the flow ends on "This browser or app may not be secure" instead of
 * the password step. Kryvex keeps its farbling away from them so the page sees
 * the engine exactly as Chromium presents it.
 *
 * The rule is deliberately narrow. A Google *product* page (Gmail, YouTube) is
 * an ordinary site and keeps the full privacy treatment; only the account
 * surface stands aside.
 */

/** Google's account hosts use at most two labels after the brand. */
function isBrandTail(labels: string[]): boolean {
  if (labels.length < 1 || labels.length > 2) return false;
  return labels.every(label => /^[a-z]{2,6}$/i.test(label));
}

export function isSignInHost(rawHost: string): boolean {
  if (typeof rawHost !== 'string' || !rawHost) return false;
  // Callers pass `location.hostname` or a URL's hostname, but an authority
  // with a port or userinfo may still arrive from a probe.
  const host = rawHost
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/^.*@/, '')
    .replace(/:\d+$/, '');
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
