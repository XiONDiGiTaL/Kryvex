import path from 'node:path';
import type { Session, WebContents } from 'electron';
import { isSignInHost } from './sign-in-hosts';
import { applicationUserAgent, stableUserAgent } from './user-agent';

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

function apply(contents: WebContents, url: string): void {
  let signIn = false;
  try {
    signIn = isSignInHost(new URL(url).hostname);
  } catch {
    return;
  }
  try {
    contents.setUserAgent(signIn ? applicationUserAgent() || chromeAgent() : chromeAgent());
  } catch {
    /* a contents that is already gone needs nothing */
  }
}

/**
 * Keeps one guest's user agent honest while it visits a sign-in provider.
 *
 * Google's account pages verify the browser and refuse an engine that claims
 * to be Chrome, so the guest reports the application's own agent on those
 * pages and the Chrome agent everywhere else. `will-navigate` and
 * `will-redirect` both fire before the navigation commits, so the document
 * that arrives sees the same agent the request carried; `did-navigate` covers
 * a history restore that skipped both.
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
