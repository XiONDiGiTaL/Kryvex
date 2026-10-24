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
 * Two rules put that back:
 *
 * - Google's own account pages, opened from a Google product page, run in the
 *   module's frame. The sign-in is cookie-based, so nothing needs the opener;
 * - any service popup that arrives at the opener's own site is folded back into
 *   the module (the popup closes and its page loads in the frame), and a popup
 *   that visited a sign-in host refreshes the module when it closes, because
 *   the cookies it earned are what turn the signed-out page into a signed-in
 *   one.
 *
 * A third-party "Sign in with Google" is left alone: those flows hand a result
 * back through `window.opener` and need their real popup.
 */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
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
 * Watches a service's child window and folds its result back into the module.
 * The popup is left to the provider's own flow; only its destination is
 * redirected.
 */
export function followServicePopup(opener: WebContents, popup: WebContents): void {
  let visitedSignIn = false;
  let folded = false;

  const fold = (url: string): void => {
    if (isSignInHost(hostOf(url))) visitedSignIn = true;
    let current = '';
    try {
      current = opener.getURL();
    } catch {
      return;
    }
    if (!returnsToOpener(current, url)) return;
    try {
      void opener.loadURL(url).catch(() => undefined);
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

  popup.on('did-navigate', (_event, url) => fold(url));
  popup.on('did-navigate-in-page', (_event, url) => fold(url));
  popup.once('destroyed', () => {
    // A folded popup already put its page in the module; reloading it again
    // would throw away the page the fold just loaded.
    if (!visitedSignIn || folded) return;
    // The session already holds the new cookies; a reload is what makes the
    // module show the page they unlock.
    try {
      if (!opener.isDestroyed()) opener.reload();
    } catch {
      /* the module closed while its sign-in window was open */
    }
  });
}
