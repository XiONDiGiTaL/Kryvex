import { type BrowserWindow, type WebContents } from 'electron';
import { isAliveContents, isAliveWindow } from './lifecycle';
import {
  isPopupTabCandidate,
  popupLabel,
  popupPlacement,
  type RectLike,
} from './popup-rules';
import { serviceSessions } from './service-sessions';
import type { PopupTabInfo, PopupTabRect } from './types';

const PREFERRED_SIZE = { width: 520, height: 720 };
const DEBUG = process.env.KRYVEX_POPUP_DEBUG === '1';
/** A pending mark only guards the synchronous window creation that follows. */
const PENDING_TTL_MS = 10_000;

interface PopupRecord {
  id: string;
  windowId: number;
  window: BrowserWindow;
  contents: WebContents;
  opener: WebContents;
  active: boolean;
  canvas: RectLike | null;
}

interface AllowResponse {
  action: 'allow';
  overrideBrowserWindowOptions: Electron.BrowserWindowConstructorOptions;
}

/**
 * In-app popup tabs.
 *
 * A page's `window.open` used to leave Kryvex: the link went to the system
 * browser, the provider signed the user in somewhere else, and the opener page
 * never saw the `postMessage` that finishes the flow. Electron cannot move that
 * popup's page into a tab: its `webContents` is bound to the window Chromium
 * made for it, so Kryvex keeps the real popup window (which is what preserves
 * `window.opener` and the shared session) and places it exactly over the
 * browser canvas. The tab strip lists it as a tab, the canvas underneath is
 * inert while it is active, and closing it returns to the opener.
 *
 * Only browser tabs and popups they spawn take this path. Service modules keep
 * the plain child sign-in window they already had.
 */
class PopupTabManager {
  private shell: BrowserWindow | null = null;
  private shellContents: WebContents | null = null;
  private canvas: RectLike | null = null;
  private records = new Map<string, PopupRecord>();
  private byWindow = new Map<number, PopupRecord>();
  private pending = new Map<number, ReturnType<typeof setTimeout>>();
  private sequence = 0;
  private attached = new WeakSet<BrowserWindow>();

  attachWindow(win: BrowserWindow): void {
    this.shell = win;
    this.shellContents = win.webContents;
    if (this.attached.has(win)) return;
    this.attached.add(win);

    const follow = () => this.positionActive();
    win.on('move', follow);
    win.on('resize', follow);
    win.on('minimize', () => this.hideAll());
    win.on('restore', () => this.showActive());
    win.on('hide', () => this.hideAll());
    win.on('show', () => this.showActive());
    win.once('closed', () => {
      if (this.shell === win) {
        this.shell = null;
        this.shellContents = null;
        this.canvas = null;
      }
      for (const record of [...this.records.values()]) this.close(record.id);
    });
  }

  /**
   * The window-open policy for one guest. Returns the allow response when the
   * popup belongs in the tab strip, and `null` when the caller's existing
   * policy should decide.
   */
  open(opener: WebContents, url: string, disposition: string): AllowResponse | null {
    const shell = this.shell;
    if (!isAliveWindow(shell)) return null;
    let type = '';
    let service = false;
    try {
      type = opener.getType();
      service = serviceSessions.isServiceSession(opener.session);
    } catch {
      return null;
    }
    if (!isPopupTabCandidate({ type, service, url, disposition })) {
      if (DEBUG) console.log('[popup] not a candidate', JSON.stringify({ type, service, url, disposition }));
      return null;
    }
    if (DEBUG) console.log('[popup] allow', JSON.stringify({ type, url, disposition }));

    this.markPending(opener.id);
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        show: false,
        frame: false,
        parent: shell,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false,
        autoHideMenuBar: true,
        backgroundColor: '#0B0E12',
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      },
    };
  }

  /** Registers the window Chromium just created; false leaves it to the caller. */
  claim(win: BrowserWindow, opener: WebContents): boolean {
    let openerId = -1;
    try {
      openerId = opener.id;
    } catch {
      return false;
    }
    // No mark means this popup does not belong in the tab strip (a service
    // sign-in window, or a window Chromium created for the shell).
    if (!this.pending.has(openerId)) {
      if (DEBUG) console.log('[popup] claim without a pending mark', openerId);
      return false;
    }
    this.clearPending(openerId);
    if (DEBUG) console.log('[popup] claim', openerId);
    if (!isAliveWindow(win)) return false;

    const windowId = win.id;
    const contents = win.webContents;
    const id = `popup-${++this.sequence}`;
    const record: PopupRecord = {
      id,
      windowId,
      window: win,
      contents,
      opener,
      active: false,
      canvas: this.canvas,
    };
    this.records.set(id, record);
    this.byWindow.set(windowId, record);

    try {
      win.setMenuBarVisibility(false);
    } catch {
      /* a frameless window has no menu bar to hide */
    }

    const update = () => this.emitChanged(record);
    contents.on('page-title-updated', update);
    contents.on('did-navigate', update);
    contents.on('did-navigate-in-page', update);
    contents.on('did-start-loading', update);
    contents.on('did-stop-loading', update);

    win.once('closed', () => {
      this.records.delete(id);
      this.byWindow.delete(windowId);
      this.send('kryvex:popups:closed', { id });
    });

    // Closing the tab that opened the popup closes the popup, the way a browser
    // closes a window whose opener is gone.
    try {
      opener.once('destroyed', () => {
        if (this.records.has(id)) this.close(id);
      });
    } catch {
      /* the opener was already gone; the closed handler above still fires */
    }

    this.position(record);
    this.send('kryvex:popups:opened', this.info(record));
    return true;
  }

  list(): PopupTabInfo[] {
    return [...this.records.values()].map(record => this.info(record));
  }

  /** The renderer reports the canvas rectangle in CSS pixels. */
  setCanvas(rect: PopupTabRect | null): void {
    this.canvas = sanitizeRect(rect);
    for (const record of this.records.values()) record.canvas = this.canvas;
    this.positionActive();
  }

  show(id: unknown): boolean {
    const record = this.find(id);
    if (!record) return false;
    record.active = true;
    this.position(record);
    try {
      record.window.show();
    } catch {
      return false;
    }
    return true;
  }

  hide(id: unknown): boolean {
    const record = this.find(id);
    if (!record) return false;
    record.active = false;
    try {
      record.window.hide();
    } catch {
      return false;
    }
    return true;
  }

  hideAll(): void {
    for (const record of this.records.values()) {
      record.active = false;
      try {
        record.window.hide();
      } catch {
        /* a closing window needs no further hiding */
      }
    }
  }

  close(id: unknown): boolean {
    const record = this.find(id);
    if (!record) return false;
    if (!isAliveWindow(record.window)) return false;
    try {
      record.window.close();
    } catch {
      return false;
    }
    return true;
  }

  action(id: unknown, action: unknown): boolean {
    const record = this.find(id);
    if (!record || !isAliveContents(record.contents)) return false;
    try {
      switch (action) {
        case 'back':
          if (record.contents.navigationHistory.canGoBack()) record.contents.navigationHistory.goBack();
          return true;
        case 'forward':
          if (record.contents.navigationHistory.canGoForward()) {
            record.contents.navigationHistory.goForward();
          }
          return true;
        case 'reload':
          record.contents.reload();
          return true;
        case 'stop':
          record.contents.stop();
          return true;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * A hidden popup still runs its page; only the active one is positioned and
   * shown. Called on every shell move or resize so the popup keeps covering the
   * canvas exactly.
   */
  private positionActive(): void {
    for (const record of this.records.values()) {
      if (!record.active) continue;
      this.position(record);
    }
  }

  private showActive(): void {
    for (const record of this.records.values()) {
      if (!record.active) continue;
      this.position(record);
      try {
        record.window.show();
      } catch {
        /* a window that closed while the shell was hidden is already gone */
      }
    }
  }

  private position(record: PopupRecord): void {
    const shell = this.shell;
    if (!isAliveWindow(shell) || !isAliveWindow(record.window)) return;
    let content: Electron.Rectangle;
    try {
      content = shell.getContentBounds();
    } catch {
      return;
    }
    try {
      record.window.setBounds(popupPlacement(record.canvas, content, PREFERRED_SIZE));
    } catch {
      /* the popup may be closing; it is not worth a second failure */
    }
  }

  private info(record: PopupRecord): PopupTabInfo {
    const blank: PopupTabInfo = {
      id: record.id,
      url: '',
      title: '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
    };
    if (!isAliveContents(record.contents)) return blank;
    try {
      const url = record.contents.getURL();
      let title = '';
      try {
        title = record.contents.getTitle();
      } catch {
        title = '';
      }
      return {
        id: record.id,
        url,
        title: popupLabel(title, url),
        loading: record.contents.isLoading(),
        canGoBack: record.contents.navigationHistory.canGoBack(),
        canGoForward: record.contents.navigationHistory.canGoForward(),
      };
    } catch {
      return blank;
    }
  }

  private emitChanged(record: PopupRecord): void {
    if (!this.records.has(record.id)) return;
    this.send('kryvex:popups:changed', this.info(record));
  }

  private find(id: unknown): PopupRecord | null {
    if (typeof id !== 'string') return null;
    return this.records.get(id) ?? null;
  }

  private markPending(openerId: number): void {
    this.clearPending(openerId);
    const timer = setTimeout(() => this.pending.delete(openerId), PENDING_TTL_MS);
    // The popup is created in the same task that requested it; the timer is
    // only a guard against a stale mark from a blocked window.
    timer.unref?.();
    this.pending.set(openerId, timer);
  }

  private clearPending(openerId: number): void {
    const timer = this.pending.get(openerId);
    if (!timer) return;
    clearTimeout(timer);
    this.pending.delete(openerId);
  }

  private send(channel: string, payload: unknown): void {
    const shell = this.shellContents;
    if (!isAliveContents(shell)) return;
    try {
      shell.send(channel, payload);
    } catch {
      /* the shell is closing; its popups close with it */
    }
  }
}

function sanitizeRect(rect: PopupTabRect | null): RectLike | null {
  if (!rect) return null;
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export const popupTabs = new PopupTabManager();
