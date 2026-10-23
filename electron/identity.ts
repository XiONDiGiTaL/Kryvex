import path from 'node:path';
import type { Session } from 'electron';

/**
 * Registers the identity preload once per session.
 *
 * It runs in every guest that shares the session: a service module, the
 * popup it opens for an auth flow, and a browser tab. Registering twice would
 * run the patch twice, which is harmless but pointless, so the session is
 * remembered.
 */
const seen = new WeakSet<Session>();

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
