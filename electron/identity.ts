import path from 'node:path';
import type { Session, WebContents } from 'electron';
import { stableUserAgent } from './user-agent';

/**
 * Registers the identity preload once per session.
 *
 * It runs in every guest that shares the session: a service module, the
 * popup it opens for an auth flow, and a browser tab. Registering twice would
 * run the patch twice, which is harmless but pointless, so the session is
 * remembered.
 */
const seen = new WeakSet<Session>();
const settled = new WeakMap<WebContents, string>();

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

/**
 * Pins one guest to the agent it will use for its whole life.
 *
 * This used to run from `will-navigate`, `will-redirect` and `did-navigate`,
 * swapping between a "Chrome" agent and a "Chromium" one per host family.
 * That was wrong twice over.
 *
 * `setUserAgent` on a WebContents that is mid-navigation installs a new agent
 * override, and Chromium answers that by cancelling and restarting the pending
 * navigation. A plain page loses one request; an OAuth flow does not survive it
 * at all. The flow is a cross-origin POST to the identity provider followed by
 * a redirect chain, so every override replays it from the start, Google counts
 * each attempt as a fresh one and its account host eventually answers 429
 * ("too many requests") — the rapid retry the user sees, caused by the app
 * rather than by Google. Ferdium hit the same wall and only changes its agent
 * from `did-navigate` for this reason; a sign-out loop in a chat client that
 * redirects through its own auth host has the same shape.
 *
 * The second reason is that the two agents differed only in their patch
 * version, so the swap changed nothing a site wants and everything a
 * fingerprint can see. The brand Google checks lives in the client hints, and
 * `hardening.ts` writes those per request; `navigator.userAgentData` is patched
 * by the preload beside it. One honest value for the life of the guest is both
 * simpler and more consistent than a toggle.
 */
export function settleUserAgent(contents: WebContents): void {
  const agent = chromeAgent();
  if (settled.get(contents) === agent) return;
  try {
    contents.setUserAgent(agent);
    settled.set(contents, agent);
  } catch {
    /* a contents that is already gone needs nothing */
  }
}
