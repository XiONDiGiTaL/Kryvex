import path from 'node:path';
import type { Session, WebContents } from 'electron';
import { isGoogleSite } from './sign-in-hosts';
import { applicationUserAgent, chromiumUserAgent, stableUserAgent } from './user-agent';

/**
 * Registers the identity preload once per session.
 *
 * It runs in every guest that shares the session: a service module, the
 * popup it opens for an auth flow, and a browser tab. Registering twice would
 * run the patch twice, which is harmless but pointless, so the session is
 * remembered.
 */
const seen = new WeakSet<Session>();
const followed = new WeakSet<WebContents>();

export function ensureBrowserIdentity(ses: Session): void {
  if (seen.has(ses)) return;
  seen.add(ses);
  try {
    ses.registerPreloadScript({
      type: 'frame',
      id: 'kryvex-browser-identity',
      filePath: path.join(__dirname, 'identity-preload.js'),
    });
  } catch {
    // A session that cannot take the preload keeps the plain Chromium surface.
  }
}

function chromeAgent(): string {
  return stableUserAgent(process.platform, process.versions.chrome);
}

/** The engine naming only itself; see `chromiumUserAgent`. */
function chromiumAgent(): string {
  return chromiumUserAgent(applicationUserAgent()) || chromeAgent();
}

function apply(contents: WebContents, url: string): void {
  let google = false;
  try {
    google = isGoogleSite(new URL(url).hostname);
  } catch {
    return;
  }
  try {
    contents.setUserAgent(google ? chromiumAgent() : chromeAgent());
  } catch {
    /* a contents that is already gone needs nothing */
  }
}

/**
 * Keeps one guest's user agent honest for the site family it is on.
 *
 * Google is the exception that proves the rule: its account pages verify the
 * browser and refuse an engine that claims to be Chrome, and treat one that
 * announces the Electron shell as an embedded browser, so Google hosts report
 * the bare Chromium agent. That decision follows the *host family*
 * rather than the individual page, because a sign-in starts on Gmail or
 * YouTube, redirects to the account host for the password and returns to the
 * product. Changing identity at any point in that round trip is exactly what
 * makes Google treat the returning visit as a different browser.
 *
 * `will-navigate` and `will-redirect` both fire before the navigation commits,
 * so the document that arrives sees the same agent the request carried;
 * `did-navigate` covers a history restore that skipped both.
 */
export function followUserAgent(contents: WebContents): void {
  if (followed.has(contents)) return;
  followed.add(contents);
  const follow = (url: unknown) => {
    if (typeof url === 'string') apply(contents, url);
  };
  contents.on('will-navigate', (_event, url) => follow(url));
  contents.on('will-redirect', (_event, url) => follow(url));
  contents.on('did-navigate', (_event, url) => follow(url));
  try {
    follow(contents.getURL());
  } catch {
    /* the guest has not navigated yet */
  }
}
