import { session, webContents, type Cookie, type Session, type WebContents } from 'electron';
import { isServicePartition } from './service-rules';
import {
  isSteamCookieDomain,
  isSteamSessionUrl,
  steamCookieExpiry,
} from './steam-session-rules';

/**
 * Owns the small amount of state that makes a service module feel installed
 * rather than bookmarked:
 *
 * - the notification policy for persistent service partitions, toggleable in
 *   Settings and denied for throwaway browser tabs;
 * - session clearing for one service, without touching any other module.
 *
 * The session object identity is stable per partition in the main process, so
 * recording it at webview attach time is enough to recognise it later.
 */
export interface ServicePolicy {
  notifications: boolean;
  muted: boolean;
}

const DEFAULT_POLICY: ServicePolicy = { notifications: true, muted: false };

class ServiceSessionManager {
  private services = new WeakSet<Session>();
  private partitions = new Set<string>();
  private sessionPartition = new WeakMap<Session, string>();
  private policies = new Map<string, ServicePolicy>();
  private notifications = true;
  private cookieKeepAlive = new WeakSet<Session>();

  /**
   * Called from will-attach-webview with the guest's declared partition and,
   * when Electron has it, source. A Steam source arms cookie persistence
   * immediately; observeGuest below covers the case where src arrives later.
   */
  markPartition(partition: unknown, src?: unknown): void {
    if (!isServicePartition(partition)) return;
    try {
      const target = session.fromPartition(partition);
      this.services.add(target);
      this.sessionPartition.set(target, partition);
      this.partitions.add(partition);
      if (isSteamSessionUrl(src)) this.keepSteamSignedIn(target);
    } catch {
      /* a partition that cannot be resolved simply gets no service grants */
    }
  }

  /**
   * A webview is often attached before its src attribute is read, so the
   * service URL is not always available in will-attach-webview. Watching the
   * guest's first real navigation is the reliable signal: by the time a Steam
   * page loads, its partition is known and its login cookies can be kept.
   */
  observeGuest(contents: WebContents): void {
    const partition = this.partitionFor(contents);
    if (!partition) return;
    const check = (url: string) => {
      if (isSteamSessionUrl(url)) this.keepSteamSignedIn(contents.session);
    };
    try {
      check(contents.getURL());
    } catch {
      /* the guest has not navigated yet */
    }
    contents.on('did-navigate', (_event, url) => check(url));
    contents.on('did-navigate-in-page', (_event, url) => check(url));
    contents.on('dom-ready', () => {
      try {
        check(contents.getURL());
      } catch {
        /* the guest is already gone */
      }
    });
  }

  /**
   * Steam decides at login time whether an auth cookie is a session cookie.
   * Electron does not write those to disk, so a restart signs the user out
   * even though the service partition is persistent. Rewriting each Steam
   * session cookie with a distant expiry keeps the module signed in; the
   * browser still treats it as an ordinary auth cookie.
   *
   * The listener never re-triggers itself: the rewritten cookie is no longer a
   * session cookie, so it is ignored on the way back through `changed`.
   */
  private keepSteamSignedIn(target: Session): void {
    if (this.cookieKeepAlive.has(target)) return;
    this.cookieKeepAlive.add(target);

    target.cookies.on('changed', (_event, cookie, _cause, removed) => {
      if (removed || !cookie.session || !isSteamCookieDomain(cookie.domain)) return;
      void this.persistSteamCookie(target, cookie);
    });

    // A partition created before this fix may already hold session cookies.
    void target.cookies
      .get({})
      .then(cookies => {
        for (const cookie of cookies) {
          if (cookie.session && isSteamCookieDomain(cookie.domain)) {
            void this.persistSteamCookie(target, cookie);
          }
        }
      })
      .catch(() => undefined);
  }

  private async persistSteamCookie(target: Session, cookie: Cookie): Promise<void> {
    const domain = cookie.domain;
    if (!domain) return;
    try {
      const host = domain.replace(/^\./, '');
      const scheme = cookie.secure ? 'https' : 'http';
      await target.cookies.set({
        // Passing the domain back would widen a host-only cookie to every
        // subdomain, leaving two cookies with the same name. Omit it for
        // host-only cookies so the replacement keeps the original scope.
        ...(domain.startsWith('.') ? { domain } : {}),
        url: `${scheme}://${host}${cookie.path || '/'}`,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: steamCookieExpiry(Date.now()),
      });
    } catch {
      /* a cookie the store rejects can still be used for this run */
    }
  }

  partitionFor(contents: WebContents | null | undefined): string | null {
    if (!contents) return null;
    try {
      return this.sessionPartition.get(contents.session) ?? null;
    } catch {
      return null;
    }
  }

  policyFor(partition: string | null): ServicePolicy {
    if (!partition) return DEFAULT_POLICY;
    return this.policies.get(partition) ?? DEFAULT_POLICY;
  }

  /**
   * Per-module mute and notification switches. Muting is applied to every
   * guest already attached to the partition; notifications are checked on the
   * next permission request, so a page can never grant itself.
   */
  setPolicy(rawPartition: unknown, raw: unknown): boolean {
    if (!isServicePartition(rawPartition)) return false;
    if (!raw || typeof raw !== 'object') return false;
    const source = raw as Record<string, unknown>;
    const policy: ServicePolicy = {
      notifications: source.notifications !== false,
      muted: source.muted === true,
    };
    this.policies.set(rawPartition, policy);
    try {
      const target = session.fromPartition(rawPartition);
      for (const contents of webContents.getAllWebContents()) {
        if (contents.session === target) this.applyTo(contents);
      }
    } catch {
      /* the partition may not exist yet; attach will apply it */
    }
    return true;
  }

  /** Called when a webview attaches, after its partition is marked. */
  applyTo(contents: WebContents): void {
    try {
      if (contents.getType() !== 'webview') return;
      const partition = this.partitionFor(contents);
      if (!partition) return;
      const policy = this.policyFor(partition);
      if (contents.isAudioMuted() !== policy.muted) contents.setAudioMuted(policy.muted);
    } catch {
      /* a guest that is already gone needs nothing */
    }
  }

  /** The session behind a partition, or null when it cannot be resolved. */
  private sessionFor(partition: string): Session | null {
    try {
      return session.fromPartition(partition);
    } catch {
      return null;
    }
  }

  /**
   * Writes one partition's pending page storage and cookies to disk.
   *
   * Both stores are written by Chromium on its own schedule, so anything a page
   * saved in the last few seconds is still only in the browser process when the
   * guest goes away. That matters most for a chat client: its auth token lives
   * in page storage, and a token refreshed in memory but never written is the
   * difference between reopening the module and being asked to sign in again.
   * Called before every orderly teardown and once more on quit.
   */
  private flushPartition(target: Session): Promise<void> {
    try {
      // Page storage (localStorage) is written synchronously by this call.
      target.flushStorageData();
    } catch {
      /* a store that is already closed has nothing left to write */
    }
    return target.cookies.flushStore().catch(() => undefined);
  }

  /**
   * Chromium only writes partition cookie and page stores on its own schedule,
   * and an Electron app that quits does not always get the final flush. Without
   * this, every module the user signed into during the last minute of a session
   * asks for a fresh sign-in on the next launch. Called once from before-quit,
   * with a timeout so a wedged store can never hold the app open.
   */
  async flush(): Promise<void> {
    const targets: Session[] = [session.defaultSession];
    for (const partition of this.partitions) {
      try {
        targets.push(session.fromPartition(partition));
      } catch {
        /* a partition that vanished has nothing left to write */
      }
    }
    await Promise.all(targets.map(target => this.flushPartition(target)));
  }

  isServiceSession(ses: Session | null | undefined): boolean {
    if (!ses) return false;
    return this.services.has(ses);
  }

  allowsNotifications(contents: WebContents | null | undefined): boolean {
    if (!this.notifications || !contents) return false;
    try {
      if (contents.getType() !== 'webview' || !this.isServiceSession(contents.session)) return false;
      return this.policyFor(this.partitionFor(contents)).notifications;
    } catch {
      return false;
    }
  }

  setNotifications(enabled: boolean): void {
    this.notifications = Boolean(enabled);
  }

  notificationsEnabled(): boolean {
    return this.notifications;
  }

  /**
   * Force-closes every guest page that belongs to one module.
   *
   * The shell also unmounts the frame, but a wedged renderer can outlive its
   * element, so the main process ends the guests itself. This is a stop, not a
   * reload: the partition keeps its cookies, so reopening the module is a
   * fresh visit with the same sign-in.
   */
  stop(partition: unknown): number {
    if (!isServicePartition(partition)) return 0;
    // Flush before the guests go: a page that never got its unload handlers has
    // still handed everything it saved to the browser process, and this is what
    // puts it on disk instead of losing it with the renderer.
    const target = this.sessionFor(partition);
    if (target) void this.flushPartition(target);
    let stopped = 0;
    for (const contents of webContents.getAllWebContents()) {
      try {
        if (contents.getType() !== 'webview') continue;
        if (this.partitionFor(contents) !== partition) continue;
        // A page cannot veto a forced stop: waiting for beforeunload would let
        // the very page the user is trying to end hold the button hostage.
        contents.close({ waitForBeforeUnload: false });
        stopped += 1;
      } catch {
        /* a guest that is already gone needs nothing */
      }
    }
    return stopped;
  }

  /** Clears only the named service partition: cookies, storage and cache. */
  async clear(partition: unknown): Promise<boolean> {
    if (!isServicePartition(partition)) return false;
    try {
      const target = session.fromPartition(partition);
      await target.clearStorageData();
      await target.clearCache();
      return true;
    } catch {
      return false;
    }
  }
}

export const serviceSessions = new ServiceSessionManager();
