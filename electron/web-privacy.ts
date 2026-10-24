import crypto from 'node:crypto';
import path from 'node:path';
import type {
  CallbackResponse,
  OnBeforeRequestListenerDetails,
  Session,
  WebContents,
} from 'electron';
import type { ElectronBlocker } from '@ghostery/adblocker-electron';
import { isSignInHost } from './sign-in-hosts';
import { canonicalUrl, stripTrackingParams, upgradeToHttps } from './url-privacy-rules';

export interface PrivacyOptions {
  httpsUpgrade: boolean;
  stripTracking: boolean;
  fingerprint: boolean;
}

export interface PrivacyStats {
  httpsUpgrades: number;
  paramsStripped: number;
}

const DEFAULT_OPTIONS: PrivacyOptions = {
  httpsUpgrade: true,
  stripTracking: true,
  fingerprint: true,
};

const FALLBACK_TTL_MS = 20_000;
const MAX_PENDING = 200;

interface SessionEntry {
  session: Session;
  blocker: ElectronBlocker | null;
  preloadId?: string;
}

interface PendingUpgrade {
  httpUrl: string;
  at: number;
}

function requestKey(contentsId: number | undefined, url: string): string | null {
  if (!contentsId) return null;
  return `${contentsId}|${canonicalUrl(url)}`;
}

/**
 * Combines Kryvex's URL rules with Ghostery's network engine.
 *
 * Electron allows one listener per webRequest event, so asking both libraries
 * to install their own `onBeforeRequest` would silently disable one of them.
 * This manager installs a single listener that rewrites the navigation first
 * and then delegates the unchanged request to the current blocker.
 *
 * The manager also owns the one-time HTTP fallback for upgraded navigations
 * and the per-site seed used by the fingerprinting preload.
 */
class WebPrivacy {
  private options: PrivacyOptions = { ...DEFAULT_OPTIONS };
  private entries = new WeakMap<Session, SessionEntry>();
  private pending = new Map<string, PendingUpgrade>();
  private allowHttp = new Map<string, number>();
  private seenContents = new WeakSet<WebContents>();
  private secret = crypto.randomBytes(32);
  private upgrades = 0;
  private stripped = 0;

  getOptions(): PrivacyOptions {
    return { ...this.options };
  }

  setOptions(next: Partial<PrivacyOptions>): void {
    this.options = { ...this.options, ...next };
  }

  stats(): PrivacyStats {
    return { httpsUpgrades: this.upgrades, paramsStripped: this.stripped };
  }

  ensureSession(session: Session, withPreload = false): void {
    const entry = this.entry(session);
    if (withPreload) this.registerPreload(entry);
    this.install(entry);
  }

  setBlocker(session: Session, blocker: ElectronBlocker | null): void {
    const entry = this.entry(session);
    entry.blocker = blocker;
    this.install(entry);
  }

  /**
   * A deterministic 32-bit seed for the top-level site. The preload asks for
   * this synchronously before page scripts run. The seed changes per app
   * launch and per site, so two visits in one session are consistent while a
   * different site sees different noise.
   */
  fingerprintSeed(sender: WebContents, site: unknown): number {
    if (!this.options.fingerprint) return 0;
    try {
      if (!sender || sender.getType() !== 'webview') return 0;
    } catch {
      return 0;
    }

    // Google's account pages decide whether the browser is trustworthy. A
    // wrapped canvas or audio call is exactly what that check looks for, so
    // the sign-in surface keeps the engine stock and gets no noise at all.
    try {
      if (isSignInHost(new URL(sender.getURL()).hostname)) return 0;
    } catch {
      /* a page between navigations keeps its normal seed */
    }

    let key = typeof site === 'string' ? site.slice(0, 2048) : '';
    try {
      const url = new URL(key);
      if (url.protocol === 'http:' || url.protocol === 'https:') key = url.origin;
    } catch {
      if (!key) key = 'unknown';
    }

    const digest = crypto.createHmac('sha256', this.secret).update(key).digest();
    return digest.readUInt32LE(0) || 1;
  }

  /**
   * Watches every webContents for the failure of an upgraded HTTPS
   * navigation. A single HTTP retry is allowed for that exact destination,
   * which keeps the browser usable on legacy sites without leaving a blanket
   * downgrade exception behind.
   */
  attachContents(contents: WebContents): void {
    if (this.seenContents.has(contents)) return;
    this.seenContents.add(contents);

    contents.on('did-fail-load', (_event, errorCode, _description, validatedURL, isMainFrame) => {
      if (isMainFrame === false || errorCode === -3) return;
      const fallback = this.takePending(contents.id, validatedURL);
      if (!fallback) return;
      const key = requestKey(contents.id, fallback);
      if (key) this.allowHttp.set(key, Date.now());
      // Let Chromium finish tearing down the failed HTTPS navigation before
      // starting the HTTP retry; calling loadURL synchronously from the failure
      // event can abort the new navigation and surface an ERR_ABORTED log.
      setTimeout(() => {
        if (contents.isDestroyed()) return;
        void contents.loadURL(fallback).catch(() => undefined);
      }, 25);
    });

    contents.on('did-navigate', () => this.clearPending(contents.id));
    contents.once('destroyed', () => this.clearPending(contents.id));
  }

  private entry(session: Session): SessionEntry {
    let entry = this.entries.get(session);
    if (!entry) {
      entry = { session, blocker: null };
      this.entries.set(session, entry);
    }
    return entry;
  }

  private registerPreload(entry: SessionEntry): void {
    if (entry.preloadId) return;
    try {
      entry.preloadId = entry.session.registerPreloadScript({
        type: 'frame',
        id: 'kryvex-farbling',
        filePath: path.join(__dirname, 'farbling-preload.js'),
      });
    } catch {
      // A session that cannot register a preload still gets URL-level privacy.
      entry.preloadId = undefined;
    }
  }

  private install(entry: SessionEntry): void {
    entry.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      this.handle(entry, details, callback);
    });
  }

  private handle(
    entry: SessionEntry,
    details: OnBeforeRequestListenerDetails,
    callback: (response: CallbackResponse) => void,
  ): void {
    const rewritten = this.rewrite(details);
    if (rewritten) {
      callback({ redirectURL: rewritten });
      return;
    }
    // A blocked subresource on an account page is a sign-in that fails with no
    // explanation: Google's own flow loads its scripts from the same host it
    // authenticates against, and list rules written for the product sites can
    // catch one of them. The shield stands aside for the account surface.
    if (!entry.blocker || this.isSignInRequest(details.url)) {
      callback({});
      return;
    }
    try {
      entry.blocker.onBeforeRequest(details, callback);
    } catch {
      callback({});
    }
  }

  private isSignInRequest(url: string): boolean {
    try {
      return isSignInHost(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  private rewrite(details: OnBeforeRequestListenerDetails): string | null {
    if (details.resourceType !== 'mainFrame') return null;
    if (details.method.toUpperCase() !== 'GET') return null;

    if (this.consumeAllowHttp(details.webContentsId, details.url)) return null;

    let next = details.url;
    let httpUrl = details.url;

    if (this.options.stripTracking) {
      const stripped = stripTrackingParams(next, details.referrer);
      if (stripped) {
        next = stripped;
        httpUrl = stripped;
        this.stripped += 1;
      }
    }

    if (this.options.httpsUpgrade) {
      const upgraded = upgradeToHttps(next);
      if (upgraded) {
        next = upgraded;
        this.upgrades += 1;
        if (details.webContentsId) {
          this.rememberPending(details.webContentsId, upgraded, httpUrl);
        }
      }
    }

    return next === details.url ? null : next;
  }

  private rememberPending(contentsId: number, httpsUrl: string, httpUrl: string): void {
    const key = requestKey(contentsId, httpsUrl);
    if (!key) return;
    this.pending.set(key, { httpUrl, at: Date.now() });
    if (this.pending.size > MAX_PENDING) this.prune();
  }

  private takePending(contentsId: number, url: string): string | null {
    const key = requestKey(contentsId, url);
    if (!key) return null;
    const pending = this.pending.get(key);
    if (!pending) return null;
    this.pending.delete(key);
    if (Date.now() - pending.at > FALLBACK_TTL_MS) return null;
    return pending.httpUrl;
  }

  private clearPending(contentsId: number): void {
    const prefix = `${contentsId}|`;
    for (const key of [...this.pending.keys()]) {
      if (key.startsWith(prefix)) this.pending.delete(key);
    }
  }

  private consumeAllowHttp(contentsId: number | undefined, url: string): boolean {
    const key = requestKey(contentsId, url);
    if (!key) return false;
    const at = this.allowHttp.get(key);
    if (!at) return false;
    this.allowHttp.delete(key);
    return Date.now() - at <= FALLBACK_TTL_MS;
  }

  private prune(): void {
    const cutoff = Date.now() - FALLBACK_TTL_MS;
    for (const [key, value] of [...this.pending.entries()]) {
      if (value.at < cutoff) this.pending.delete(key);
    }
    for (const [key, at] of [...this.allowHttp.entries()]) {
      if (at < cutoff) this.allowHttp.delete(key);
    }
  }
}

export const webPrivacy = new WebPrivacy();
