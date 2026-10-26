import type { WebContents } from 'electron';
import { isGoogleSite, isSignInHost } from './sign-in-hosts';
import { sameSite } from './url-privacy-rules';

/**
 * Keeps a service sign-in inside the module it belongs to.
 *
 * A service's own sign-in button usually ends in `window.open`, and Kryvex used
 * to answer it with a real child window. That window shares the module's session
 * and therefore signs the user in — but it shows the product itself when it is
 * done, so the user finishes a sign-in in a stray window while the module stays
 * on its signed-out page. A browser does not behave that way: the account pages
 * open in the same tab and the click ends where it started.
 *
 * Three rules put that back:
 *
 * - Google's own account pages, opened from a Google product page, run in the
 *   module's frame. The sign-in is cookie-based, so nothing needs the opener;
 * - any service popup that arrives at the module's own site is folded back into
 *   the module (the popup closes and its page loads in the frame);
 * - whenever a popup closes without folding, the module is reconciled: it loads
 *   the popup's last page when that page belongs in the module, and otherwise
 *   reloads, because the cookies the popup earned are what turn the signed-out
 *   page into a signed-in one.
 *
 * The module's site is anchored when the popup opens, not read when the popup
 * navigates. Google sends the module to `accounts.google.com` mid-flow, so the
 * live URL is the account host by the time the popup comes back; comparing
 * against it would never recognise the product page and the popup would be left
 * standing — the exact failure this module exists to prevent.
 *
 * A third-party "Sign in with Google" is left alone: those flows hand a result
 * back through `window.opener` and need their real popup.
 */

export type PopupOutcome =
  /** Load this page in the module and close the popup. */
  | { kind: 'fold'; url: string }
  /** The session changed while the popup was open; reload the module. */
  | { kind: 'reload' }
  /** An ordinary popup with nothing to reconcile. */
  | { kind: 'none' };

function parseUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** A Google product page: Google's own host, not its account surface. */
export function isGoogleProductUrl(rawUrl: string): boolean {
  const host = hostOf(rawUrl);
  return isGoogleSite(host) && !isSignInHost(host);
}

/** A Google product page opening Google's own account pages. */
export function signsInWithin(openerUrl: string, targetUrl: string): boolean {
  const opener = hostOf(openerUrl);
  const target = hostOf(targetUrl);
  if (!opener || !target) return false;
  return isGoogleSite(opener) && isSignInHost(target);
}

/** The popup arrived at the site the opener belongs to. */
export function returnsToOpener(openerUrl: string, popupUrl: string): boolean {
  const opener = hostOf(openerUrl);
  const popup = hostOf(popupUrl);
  if (!opener || !popup) return false;
  return sameSite(opener, popup);
}

/**
 * Where a Google account page intends to send the browser when it finishes.
 * Only an account page may name a return target, and only an http(s) one: a
 * page cannot point the anchor at `javascript:` or a file.
 */
export function signInReturnTarget(rawUrl: string): string | null {
  const url = parseUrl(rawUrl);
  if (!url || !isSignInHost(url.hostname)) return null;
  for (const key of ['continue', 'continueUrl', 'continue_url']) {
    const target = parseUrl(url.searchParams.get(key));
    if (target) return target.toString();
  }
  return null;
}

/**
 * The site the module belongs to. A module parked on an account page is still
 * the product it started from, so its `continue` target is the real anchor.
 */
export function moduleHome(frameUrl: string): string {
  if (!isSignInHost(hostOf(frameUrl))) return frameUrl;
  return signInReturnTarget(frameUrl) ?? frameUrl;
}

/**
 * True when this popup page should be shown in the module instead of a window.
 *
 * `sawSignIn` is required for the cross-product Google case: a sign-in that
 * starts on Gmail can finish on another Google host, and leaving that page in a
 * window is the bug. An ordinary Google link opened from Gmail (a doc, a video)
 * has not been through an account page and keeps its own window.
 */
export function popupBelongsToModule(
  frameUrl: string,
  popupUrl: string,
  sawSignIn = false,
): boolean {
  const home = moduleHome(frameUrl);
  if (returnsToOpener(home, popupUrl)) return true;
  if (!sawSignIn) return false;
  return isGoogleProductUrl(home) && isGoogleProductUrl(popupUrl);
}

/** A cookie domain the module's own page would read. */
export function cookieBelongsToModule(domain: unknown, frameUrl: string): boolean {
  const host = hostOf(moduleHome(frameUrl));
  const cookieHost = typeof domain === 'string' ? domain.replace(/^\./, '').toLowerCase() : '';
  if (!host || !cookieHost) return false;
  return sameSite(host, cookieHost);
}

function sawSignInHost(urls: readonly string[]): boolean {
  return urls.some(url => isSignInHost(hostOf(url)));
}

/**
 * The popup has been somewhere other than the module's own site, so its return
 * to the module is the end of that trip. A popup that never left (a compose
 * window, a preview) is an ordinary in-app window and keeps it.
 */
export function leftModuleSite(frameUrl: string, urls: readonly string[]): boolean {
  const home = moduleHome(frameUrl);
  return urls.some(url => url.length > 0 && !returnsToOpener(home, url));
}

/**
 * What to do with the module once a service popup has closed.
 *
 * The last page decides first: if the popup took a round trip away from the
 * module and ended on a page that belongs in it, load that page there — that is
 * the sign-in that finished in the window instead of the frame. Failing that, a
 * popup that touched an account page, or changed a cookie the module reads, has
 * changed what the module can show, and a reload is how it notices. A module
 * left sitting on an account page is reconciled for the same reason.
 */
export function popupOutcome(
  frameUrl: string,
  urls: readonly string[],
  cookiesChanged = false,
): PopupOutcome {
  const seen = urls.filter(url => parseUrl(url) !== null);
  const last = seen[seen.length - 1] ?? '';
  const signIn = sawSignInHost(seen);
  const roundTrip = signIn || leftModuleSite(frameUrl, seen);

  if (last && roundTrip && popupBelongsToModule(frameUrl, last, signIn)) {
    return { kind: 'fold', url: last };
  }
  if (signIn || cookiesChanged) return { kind: 'reload' };
  if (isSignInHost(hostOf(frameUrl))) return { kind: 'reload' };
  return { kind: 'none' };
}

/**
 * Watches a service's child window and folds its result back into the module.
 * The popup is left to the provider's own flow; only its destination is
 * redirected, and the module is reconciled when the window closes.
 */
export function followServicePopup(opener: WebContents, popup: WebContents): void {
  let anchor = '';
  try {
    anchor = opener.getURL();
  } catch {
    anchor = '';
  }
  /** The module's page when the popup opened; the live URL drifts mid-flow. */
  const frame = (): string => {
    if (anchor) return anchor;
    try {
      return opener.isDestroyed() ? '' : opener.getURL();
    } catch {
      return '';
    }
  };

  const urls: string[] = [];
  let cookiesChanged = false;
  let folded = false;

  const onCookie = (
    _event: Electron.Event,
    cookie: Electron.Cookie,
    _cause: string,
    removed: boolean,
  ): void => {
    if (removed) return;
    if (cookieBelongsToModule(cookie.domain, frame())) cookiesChanged = true;
  };

  const detach = (): void => {
    try {
      popup.session.cookies.removeListener('changed', onCookie);
    } catch {
      /* the session is gone with the popup */
    }
  };

  try {
    popup.session.cookies.on('changed', onCookie);
  } catch {
    /* a session that cannot be watched simply gets no cookie signal */
  }

  /** Load the popup's page in the module; reload if that page will not load. */
  const show = (url: string): void => {
    void opener.loadURL(url).catch(() => {
      try {
        if (!opener.isDestroyed()) opener.reload();
      } catch {
        /* the module closed while its sign-in window was open */
      }
    });
  };

  const record = (url: string): void => {
    // `about:blank` is where a window.open that writes its own location starts;
    // it is not a page the user or the provider chose.
    if (parseUrl(url) === null) return;
    if (urls[urls.length - 1] === url) return;
    urls.push(url);
    // A redirect chain is long, and only the recent pages matter for a fold.
    if (urls.length > 32) urls.shift();
    if (folded) return;
    const signIn = sawSignInHost(urls);
    // A popup that never left the module (a compose window, a preview) keeps
    // its own window; only a round trip away and back is a sign-in finishing.
    if (!signIn && !leftModuleSite(frame(), urls)) return;
    if (!popupBelongsToModule(frame(), url, signIn)) return;
    try {
      show(url);
    } catch {
      return;
    }
    folded = true;
    try {
      popup.close();
    } catch {
      /* a window that is already closing needs nothing */
    }
  };

  popup.on('did-navigate', (_event, url) => record(url));
  popup.on('did-navigate-in-page', (_event, url) => record(url));
  popup.once('destroyed', () => {
    detach();
    if (folded) return;
    let alive = false;
    try {
      alive = !opener.isDestroyed();
    } catch {
      alive = false;
    }
    if (!alive) return;
    const outcome = popupOutcome(frame(), urls, cookiesChanged);
    try {
      if (outcome.kind === 'fold') show(outcome.url);
      else if (outcome.kind === 'reload') opener.reload();
    } catch {
      /* the module closed while its sign-in window was open */
    }
  });
}
