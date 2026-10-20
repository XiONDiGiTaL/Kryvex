/**
 * Google refuses its own sign-in page inside any browser an app controls, and
 * says so with an ordinary-looking error card. A service module cannot fix
 * that from the inside, but it can recognise the refusal and explain it
 * instead of leaving the user to blame the shield or their password.
 */

/**
 * Google domains use at most three labels after the brand (google.co.uk,
 * google.com.au), so a longer chain such as `google.com.evil.test` is a
 * lookalike rather than a Google host.
 */
function isBrandDomain(host: string, brand: string): boolean {
  const labels = host.split('.');
  const index = labels.indexOf(brand);
  if (index < 0) return false;
  const tail = labels.slice(index + 1);
  if (tail.length < 1 || tail.length > 2) return false;
  return tail.every(label => /^[a-z]{2,6}$/i.test(label));
}

/** Hosts whose pages can carry Google's embedded-browser refusal. */
export function isGoogleHost(url: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  let hostname = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com')) {
    return true;
  }
  return isBrandDomain(hostname, 'google') || isBrandDomain(hostname, 'youtube');
}

/**
 * Google's wording has been stable for years: "This browser or app may not be
 * secure", "Couldn't sign you in", and the OAuth error code
 * `disallowed_useragent`. Matching the code alone is enough; the visible copy
 * is a fallback for pages that render the card without the parameter.
 */
export function isGoogleSignInBlock(text: string): boolean {
  if (typeof text !== 'string' || !text) return false;
  const sample = text.slice(0, 8_000);
  return (
    /disallowed_useragent/i.test(sample) ||
    /browser or app may not be secure/i.test(sample) ||
    (/couldn.t sign you in/i.test(sample) && /browser/i.test(sample))
  );
}
