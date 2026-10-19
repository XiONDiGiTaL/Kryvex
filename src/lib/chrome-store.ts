const STORE_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com']);
const EXTENSION_ID = /^[a-p]{32}$/;

/**
 * Chrome Web Store detail URLs look like:
 *   https://chromewebstore.google.com/detail/<slug>/<32-char-id>
 *   https://chrome.google.com/webstore/detail/<slug>/<32-char-id>
 * Only the fixed Google hosts and an a-p extension ID are accepted.
 */
export function chromeWebStoreExtensionId(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!STORE_HOSTS.has(url.hostname)) return null;
    if (url.protocol !== 'https:') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    const detailIndex = segments.indexOf('detail');
    if (detailIndex < 0) return null;
    // Canonical detail URLs include a human-readable slug, but Google also
    // serves the ID-only form and may append extra path segments.
    const id = segments
      .slice(detailIndex + 1)
      .map(segment => segment.toLowerCase())
      .find(segment => EXTENSION_ID.test(segment));
    return id ?? null;
  } catch {
    return null;
  }
}

export function chromeWebStoreTitle(title: string): string {
  return title.replace(/\s*[-–—]\s*Chrome Web Store\s*$/i, '').trim();
}
