import { createElement, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useT } from '../lib/i18n';
import { pageSource, readPage, readSelection, selectionSource } from '../lib/vexium-capture';
import type { VexiumSourceInput } from '../lib/vexium-transfer';
import { openExternalUrl } from '../lib/external';
import {
  imageSuggestedName,
  pageMenuEntries,
  pageMenuHeader,
  type PageMenuContext,
  type PageMenuItem,
  type PageMenuTarget,
} from '../lib/page-menu';
import { stepZoom } from '../lib/zoom';
import { PageContextMenu } from './PageContextMenu';

export interface WebviewElement extends HTMLElement {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  getTitle: () => string;
  loadURL: (url: string) => Promise<void>;
  findInPage: (text: string, options?: { forward?: boolean; findNext?: boolean }) => number;
  stopFindInPage: (action: 'clearSelection' | 'keepSelection' | 'activateSelection') => void;
  getZoomFactor: () => number;
  setZoomFactor: (factor: number) => void;
  setAudioMuted: (muted: boolean) => void;
  isAudioMuted: () => boolean;
  executeJavaScript: (code: string) => Promise<unknown>;
  insertCSS: (css: string) => Promise<string>;
  removeInsertedCSS: (key: string) => Promise<void>;
  /** The guest's own process id, which the main process turns into a handle. */
  getWebContentsId: () => number;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  pasteAndMatchStyle: () => void;
  selectAll: () => void;
  copyImageAt: (x: number, y: number) => void;
  print: (options?: Record<string, unknown>) => void;
  openDevTools: () => void;
  capturePage: () => Promise<{ toDataURL: () => string }>;
}

export interface WebviewStatus {
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
}

export interface FindResult {
  matches: number;
  activeMatch: number;
}

type Tone = 'info' | 'success' | 'warning' | 'danger';

interface WebviewProps {
  src: string;
  partition: string;
  controller?: MutableRefObject<WebviewElement | null>;
  /**
   * Lets `window.open` reach the main process, which decides where the window
   * goes: a service keeps its sign-in window, a browser tab gets an in-app
   * popup tab. Without it Electron refuses the popup before that policy runs.
   */
  allowPopups?: boolean;
  /** Per-module mute switch: the page keeps its own audio state. */
  muted?: boolean;
  /** Pause media while another view is in front (service persistence). */
  paused?: boolean;
  /**
   * Turns on Send to Vexium for this page. The capture reads only the live
   * selection or the visible page text, and only after an explicit action:
   * a context-menu pick, a shortcut or a palette command.
   */
  onSendToVexium?: (source: VexiumSourceInput) => void;
  /**
   * What the page tried to notify about. Kryvex cannot read a page's
   * `Notification` from the main process, so the guest is given a shim that
   * records the attempt and still shows the real notification through the
   * browser's own constructor. Only service modules ask for this; a browser tab
   * passes nothing and is never tapped.
   */
  onActivity?: (entry: { title: string; body: string; tag: string; at: number }) => void;
  /**
   * `document` is a real page load; `in-page` is the page rewriting its own URL
   * with pushState/replaceState, which a search box does on every keystroke.
   * The address bar has to tell them apart: a load replaces what is shown, an
   * in-page change must never overwrite something being typed.
   */
  onNavigate?: (url: string, kind: 'document' | 'in-page') => void;
  onTitle?: (title: string) => void;
  onStatus?: (status: WebviewStatus) => void;
  onFound?: (result: FindResult) => void;
  /**
   * A stylesheet for this page, applied with `insertCSS` and dropped when the
   * module navigates. CSS only: a service keeps a signed-in profile, so no
   * script is ever evaluated in it.
   */
  overrideCss?: string;
  /** Installed services the page can be handed to, offered under Send to…. */
  sendTargets?: PageMenuTarget[];
  onSendTo?: (serviceId: string, url: string) => void;
  /**
   * Opens a URL in a new Kryvex browser tab. Only the browser passes this, so
   * its presence is also what tells the menu it is looking at a tab: a service
   * frame has no tab to open and gets no such entry.
   */
  onOpenTab?: (url: string) => void;
  onToast?: (message: string, tone?: Tone) => void;
}

interface MenuPoint {
  x: number;
  y: number;
  /** The click inside the guest, which copying an image needs. */
  guestX: number;
  guestY: number;
  context: PageMenuContext;
}

/** Text to the system clipboard, through the shell's own bridge first. */
async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    const bridge = window.kryvex;
    if (bridge?.filesCopyText) return await bridge.filesCopyText(text);
  } catch {
    /* the bridge refused; the browser clipboard is the fallback */
  }
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Thin wrapper around Electron's <webview>. The element is created outside
 * JSX because React has no intrinsic tag for it; all hardening happens in the
 * main process, not here.
 *
 * `partition` and `src` are applied imperatively and in that order. Electron
 * documents that the partition must be set before the source: a guest that
 * loads first is bound to the default in-memory session, which is how a
 * service could appear to forget its sign-in. React cannot guarantee attribute
 * order, so the wrapper does it explicitly.
 */
export function Webview({
  src,
  partition,
  controller,
  allowPopups = false,
  muted = false,
  paused = false,
  onSendToVexium,
  onActivity,
  onNavigate,
  onTitle,
  onStatus,
  onFound,
  overrideCss,
  sendTargets,
  onSendTo,
  onOpenTab,
  onToast,
}: WebviewProps) {
  const t = useT();
  const ref = useRef<WebviewElement | null>(null);
  const initial = useRef({ src, partition, allowPopups });
  const [menu, setMenu] = useState<MenuPoint | null>(null);
  // The handler is kept in a ref so the guest listeners never need to be
  // torn down when a parent re-renders with a new callback identity.
  const sendRef = useRef(onSendToVexium);
  sendRef.current = onSendToVexium;
  // Same trick for the tab opener: the menu listener subscribes once, but it
  // must see whether this page is a tab and which tab opener is current.
  const tabRef = useRef(onOpenTab);
  tabRef.current = onOpenTab;
  const loadingRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (controller) controller.current = el;

    const attach = () => {
      // Partition must exist before the guest navigates anywhere.
      if (el.getAttribute('partition') !== initial.current.partition) {
        el.setAttribute('partition', initial.current.partition);
      }
      if (initial.current.allowPopups) el.setAttribute('allowpopups', '');
      if (el.getAttribute('src') !== initial.current.src) {
        el.setAttribute('src', initial.current.src);
      }
    };
    attach();
    el.addEventListener('dom-ready', attach, { once: true });

    const readStatus = (loading: boolean, error: string | null = null) => {
      loadingRef.current = loading;
      // did-start-loading can arrive before dom-ready, and the guest methods
      // throw until then. Reporting "no history" is accurate at that point.
      let canGoBack = false;
      let canGoForward = false;
      try {
        canGoBack = el.canGoBack();
        canGoForward = el.canGoForward();
      } catch {
        /* guest not attached yet */
      }
      onStatus?.({ loading, canGoBack, canGoForward, error });
    };

    const onStart = () => readStatus(true);
    const onStop = () => readStatus(false);
    const onReady = () => readStatus(false);
    const onNavigated = (event: Event) => {
      const detail = event as Event & { url: string };
      onNavigate?.(detail.url, 'document');
      readStatus(false);
    };
    const onNavigatedInPage = (event: Event) => {
      const detail = event as Event & { url: string };
      onNavigate?.(detail.url, 'in-page');
      readStatus(false);
    };
    const onTitleUpdated = (event: Event) => {
      const detail = event as Event & { title: string };
      onTitle?.(detail.title);
    };
    const onFoundInPage = (event: Event) => {
      const detail = event as Event & { result?: { matches?: number; activeMatchOrdinal?: number } };
      onFound?.({
        matches: Number(detail.result?.matches ?? 0),
        activeMatch: Number(detail.result?.activeMatchOrdinal ?? 0),
      });
    };
    const onFail = (event: Event) => {
      const detail = event as Event & { errorDescription?: string; isMainFrame?: boolean; validatedURL?: string };
      if (detail.isMainFrame === false) return;
      readStatus(false, detail.errorDescription ?? 'The page could not be loaded.');
    };

    el.addEventListener('did-start-loading', onStart);
    el.addEventListener('did-stop-loading', onStop);
    el.addEventListener('dom-ready', onReady);
    el.addEventListener('did-navigate', onNavigated);
    el.addEventListener('did-navigate-in-page', onNavigatedInPage);
    el.addEventListener('page-title-updated', onTitleUpdated);
    el.addEventListener('found-in-page', onFoundInPage);
    el.addEventListener('did-fail-load', onFail);

    return () => {
      el.removeEventListener('dom-ready', attach);
      el.removeEventListener('did-start-loading', onStart);
      el.removeEventListener('did-stop-loading', onStop);
      el.removeEventListener('dom-ready', onReady);
      el.removeEventListener('did-navigate', onNavigated);
      el.removeEventListener('did-navigate-in-page', onNavigatedInPage);
      el.removeEventListener('page-title-updated', onTitleUpdated);
      el.removeEventListener('found-in-page', onFoundInPage);
      el.removeEventListener('did-fail-load', onFail);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Activity capture: a module's notifications, recorded where they happen.
   *
   * The shim is installed in the page, not in Kryvex's own renderer, because
   * `new Notification(...)` is the page's call; the real constructor is still
   * used, so nothing about what the user sees changes. The queue is drained on a
   * short interval rather than pushed, because a guest has no channel to this
   * process — the same constraint the media pause above lives with.
   */
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;
  useEffect(() => {
    const el = ref.current;
    if (!el || !activityRef.current) return;
    const INSTALL = `(() => {
      if (window.__kryvexActivityInstalled) return true;
      window.__kryvexActivityInstalled = true;
      window.__kryvexActivity = [];
      const Native = window.Notification;
      if (typeof Native !== 'function') return false;
      const record = (title, options) => {
        try {
          window.__kryvexActivity.push({
            title: String(title == null ? '' : title).slice(0, 300),
            body: String(options && options.body ? options.body : '').slice(0, 800),
            tag: String(options && options.tag ? options.tag : '').slice(0, 80),
            at: Date.now(),
          });
          if (window.__kryvexActivity.length > 40) window.__kryvexActivity.splice(0, window.__kryvexActivity.length - 40);
        } catch (error) { /* a broken page must not lose its notification */ }
      };
      function KryvexNotification(title, options) {
        record(title, options);
        return new Native(title, options);
      }
      KryvexNotification.prototype = Native.prototype;
      try { Object.setPrototypeOf(KryvexNotification, Native); } catch (error) { /* older engines */ }
      KryvexNotification.requestPermission = Native.requestPermission
        ? Native.requestPermission.bind(Native)
        : () => Promise.resolve('denied');
      try {
        Object.defineProperty(KryvexNotification, 'permission', { get: () => Native.permission });
      } catch (error) { /* read-only is fine */ }
      window.Notification = KryvexNotification;
      return true;
    })()`;
    let timer = 0;
    const drain = () => {
      try {
        void el
          .executeJavaScript(`window.__kryvexActivity ? window.__kryvexActivity.splice(0, 20) : []`)
          .then(items => {
            if (!Array.isArray(items)) return;
            for (const item of items) {
              if (!item || typeof item !== 'object') continue;
              activityRef.current?.({
                title: String((item as { title?: unknown }).title ?? ''),
                body: String((item as { body?: unknown }).body ?? ''),
                tag: String((item as { tag?: unknown }).tag ?? ''),
                at: Number((item as { at?: unknown }).at ?? Date.now()),
              });
            }
          })
          .catch(() => undefined);
      } catch {
        /* the guest is between navigations */
      }
    };
    const install = () => {
      try {
        void el.executeJavaScript(INSTALL).catch(() => undefined);
      } catch {
        /* not attached yet; dom-ready runs this again */
      }
      if (!timer) timer = window.setInterval(drain, 2500);
      drain();
    };
    el.addEventListener('dom-ready', install);
    install();
    return () => {
      el.removeEventListener('dom-ready', install);
      if (timer) window.clearInterval(timer);
    };
  }, []);

  // A guest attaches its audio output later than the React element exists, so
  // every policy is re-applied on dom-ready instead of only on prop changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      try {
        el.setAudioMuted(Boolean(muted) || Boolean(paused));
      } catch {
        /* the guest may be between navigations */
      }
      // A one-off pause misses the next autoplaying clip on a feed. Installing
      // a capture-phase `play` guard keeps new media paused until the module is
      // brought back to the front; it is removed when the view becomes active.
      try {
        void el
          .executeJavaScript(
            `(() => {
               const KEY = '__kryvexMediaPaused';
               if (${paused}) {
                 window[KEY] = true;
                 document.querySelectorAll('video, audio').forEach(media => media.pause());
                 if (!window.__kryvexPauseGuard) {
                   window.__kryvexPauseGuard = event => {
                     if (event.target && typeof event.target.pause === 'function') event.target.pause();
                   };
                   document.addEventListener('play', window.__kryvexPauseGuard, true);
                 }
               } else if (window[KEY]) {
                 window[KEY] = false;
                 if (window.__kryvexPauseGuard) {
                   document.removeEventListener('play', window.__kryvexPauseGuard, true);
                   window.__kryvexPauseGuard = null;
                 }
               }
               return true;
             })()`,
          )
          .catch(() => undefined);
      } catch {
        // Electron throws synchronously if the guest has not attached yet;
        // the dom-ready listener above runs this again once it has.
      }
    };
    apply();
    el.addEventListener('dom-ready', apply);
    return () => el.removeEventListener('dom-ready', apply);
  }, [muted, paused]);

  /**
   * The per-service stylesheet.
   *
   * `insertCSS` is the only way in: a module keeps a signed-in profile, so the
   * sheet is CSS and nothing else. It belongs to the current document, so it is
   * dropped and re-applied on every `dom-ready`, which is what carries a theme
   * through navigation rather than only until the first link is followed.
   */
  const overrideRef = useRef(overrideCss);
  overrideRef.current = overrideCss;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let key: string | null = null;
    let disposed = false;
    const drop = () => {
      if (key === null) return;
      const leaving = key;
      key = null;
      try {
        void el.removeInsertedCSS(leaving).catch(() => undefined);
      } catch {
        /* the guest may be between navigations */
      }
    };
    const apply = () => {
      drop();
      const css = overrideRef.current;
      if (!css) return;
      try {
        void el
          .insertCSS(css)
          .then(inserted => {
            if (disposed) {
              try {
                void el.removeInsertedCSS(inserted).catch(() => undefined);
              } catch {
                /* detached */
              }
              return;
            }
            key = inserted;
          })
          .catch(() => undefined);
      } catch {
        /* not attached yet; dom-ready runs this again */
      }
    };
    el.addEventListener('dom-ready', apply);
    apply();
    return () => {
      disposed = true;
      el.removeEventListener('dom-ready', apply);
      drop();
    };
  }, [overrideCss]);

  /**
   * The right-click menu.
   *
   * Electron reports what was under the pointer with the click: a selection, a
   * link, an image, an editable field. The menu is built from that report, so
   * it never offers an action the click cannot complete, and the page itself is
   * only read when an entry that needs its text is chosen.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMenu = (event: Event) => {
      const params = (event as Event & {
        params?: {
          x?: number;
          y?: number;
          linkURL?: string;
          srcURL?: string;
          mediaType?: string;
          selectionText?: string;
          isEditable?: boolean;
        };
      }).params;
      if (!params) return;
      const rect = el.getBoundingClientRect();
      let url = '';
      try {
        url = el.getURL();
      } catch {
        url = '';
      }
      let host = '';
      try {
        host = new URL(url).host;
      } catch {
        host = '';
      }
      let canGoBack = false;
      let canGoForward = false;
      let zoom = 1;
      try {
        canGoBack = el.canGoBack();
        canGoForward = el.canGoForward();
      } catch {
        /* the guest is between navigations */
      }
      try {
        zoom = el.getZoomFactor();
      } catch {
        /* the guest is between navigations */
      }
      setMenu({
        x: rect.left + Number(params.x ?? 0),
        y: rect.top + Number(params.y ?? 0),
        guestX: Number(params.x ?? 0),
        guestY: Number(params.y ?? 0),
        context: {
          browser: Boolean(tabRef.current),
          url,
          host,
          selection: String(params.selectionText ?? ''),
          linkUrl: String(params.linkURL ?? ''),
          imageUrl: params.mediaType === 'image' ? String(params.srcURL ?? '') : '',
          isEditable: Boolean(params.isEditable),
          canGoBack,
          canGoForward,
          loading: loadingRef.current,
          zoom,
        },
      });
    };
    el.addEventListener('context-menu', onMenu);
    return () => el.removeEventListener('context-menu', onMenu);
  }, []);

  async function pick(mode: 'selection' | 'selection-and-page' | 'page') {
    const el = ref.current;
    const send = sendRef.current;
    if (!el || !send) return;
    let title = '';
    try {
      title = el.getTitle?.() ?? '';
    } catch {
      title = '';
    }
    if (mode === 'page') {
      send(pageSource(await readPage(el)));
      return;
    }
    const selection = await readSelection(el);
    send(selectionSource({ title, url: el.getURL() }, selection, mode === 'selection-and-page'));
  }

  const say = (
    message: string,
    tone: Tone = 'info',
    vars?: Record<string, string>,
  ) => onToast?.(t(message, vars), tone);

  /** Runs one entry the menu offered, against the click it was built for. */
  async function run(item: PageMenuItem) {
    const el = ref.current;
    const point = menu;
    if (!el || !point) return;
    const context = point.context;
    const guest = (action: () => void) => {
      try {
        action();
      } catch {
        /* the guest can detach between the click and the action */
      }
    };

    if (item.id.startsWith('send:')) {
      const target = item.id.slice('send:'.length);
      onSendTo?.(target, context.linkUrl || context.url);
      return;
    }

    switch (item.id) {
      case 'back':
        guest(() => el.goBack());
        return;
      case 'forward':
        guest(() => el.goForward());
        return;
      case 'reload':
        guest(() => el.reload());
        return;
      case 'stop':
        guest(() => el.stop());
        return;
      case 'undo':
        guest(() => el.undo());
        return;
      case 'redo':
        guest(() => el.redo());
        return;
      case 'cut':
        guest(() => el.cut());
        return;
      case 'paste':
        // The menu is drawn by the shell, so choosing an entry hands focus away
        // from the guest: the field has to be given it back first, or the paste
        // lands in a document that no longer has a focused element.
        guest(() => {
          el.focus();
          el.paste();
        });
        return;
      case 'paste-match':
        guest(() => {
          el.focus();
          el.pasteAndMatchStyle();
        });
        return;
      case 'select-all':
        guest(() => el.selectAll());
        return;
      case 'copy': {
        const copied = await copyText(context.selection);
        say(copied ? 'Copied to the clipboard.' : 'The clipboard refused the text.', copied ? 'info' : 'danger');
        return;
      }
      case 'copy-link':
      case 'copy-image-address':
      case 'copy-url':
        say(
          (await copyText(
            item.id === 'copy-url' ? context.url : item.id === 'copy-link' ? context.linkUrl : context.imageUrl,
          ))
            ? 'Copied to the clipboard.'
            : 'The clipboard refused the text.',
        );
        return;
      case 'copy-image':
        guest(() => el.copyImageAt(point.guestX, point.guestY));
        return;
      case 'save-image': {
        const bridge = window.kryvex;
        if (!bridge?.imageSave || !context.imageUrl) return;
        const result = await bridge.imageSave({
          url: context.imageUrl,
          suggested: imageSuggestedName(context.imageUrl),
        });
        if (result.ok) say('Saved to {path}.', 'success', { path: result.path ?? '' });
        else if (!result.cancelled) say('The image could not be saved.', 'danger');
        return;
      }
      case 'share-link':
        say((await copyText(context.url)) ? 'Link copied. Paste it anywhere.' : 'The clipboard refused the text.');
        return;
      case 'open-link-tab':
        if (context.linkUrl) onOpenTab?.(context.linkUrl);
        return;
      case 'open-image-tab':
        if (context.imageUrl) onOpenTab?.(context.imageUrl);
        return;
      case 'open-link-external':
        openExternalUrl(context.linkUrl);
        return;
      case 'open-external':
        openExternalUrl(context.url);
        return;
      case 'view-source':
        if (context.url) onOpenTab?.(`view-source:${context.url}`);
        return;
      case 'zoom-in':
        guest(() => el.setZoomFactor(stepZoom(context.zoom, 1)));
        return;
      case 'zoom-out':
        guest(() => el.setZoomFactor(stepZoom(context.zoom, -1)));
        return;
      case 'zoom-reset':
        guest(() => el.setZoomFactor(1));
        return;
      case 'print':
        guest(() => el.print());
        return;
      case 'inspect':
        guest(() => el.openDevTools());
        return;
      case 'save-page': {
        const bridge = window.kryvex;
        if (!bridge?.pageSave) return;
        const result = await bridge.pageSave({
          webContentsId: el.getWebContentsId(),
          suggested: context.host || 'page',
        });
        if (result.ok) say('Saved to {path}.', 'success', { path: result.path ?? '' });
        else if (!result.cancelled) say('The page could not be saved.', 'danger');
        return;
      }
      case 'screenshot': {
        const bridge = window.kryvex;
        if (!bridge?.captureSave) return;
        const shot = await el.capturePage();
        const result = await bridge.captureSave({
          data: shot.toDataURL(),
          name: context.host || 'page',
          kind: 'shot',
        });
        if (result.ok) say('Screenshot saved to {path}.', 'success', { path: result.path ?? '' });
        else if (!result.cancelled) say('The screenshot could not be saved.', 'danger');
        return;
      }
      case 'vexium-selection':
        if (sendRef.current) void pick('selection');
        return;
      case 'vexium-selection-page':
        if (sendRef.current) void pick('selection-and-page');
        return;
      case 'vexium-page':
        if (sendRef.current) void pick('page');
        return;
      default:
        return;
    }
  }

  return (
    <>
      {createElement('webview', {
        ref: (node: WebviewElement | null) => {
          ref.current = node;
          if (controller) controller.current = node;
        },
        partition,
        className: 'webview',
        // Content preferences (throttling, scripts, images) are owned by the main
        // process, which applies the engine profile on `will-attach-webview`.
        webpreferences: 'contextIsolation=yes, nodeIntegration=no, sandbox=yes',
        style: { width: '100%', height: '100%' },
      })}
      {menu ? (
        <PageContextMenu
          items={pageMenuEntries(menu.context, sendTargets ?? [])}
          header={pageMenuHeader(menu.context)}
          point={{ x: menu.x, y: menu.y }}
          onPick={item => void run(item)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
