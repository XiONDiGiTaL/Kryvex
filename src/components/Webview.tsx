import { createElement, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n';
import { pageSource, readPage, readSelection, selectionSource } from '../lib/vexium-capture';
import type { VexiumSourceInput } from '../lib/vexium-transfer';

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
   * `document` is a real page load; `in-page` is the page rewriting its own URL
   * with pushState/replaceState, which a search box does on every keystroke.
   * The address bar has to tell them apart: a load replaces what is shown, an
   * in-page change must never overwrite something being typed.
   */
  onNavigate?: (url: string, kind: 'document' | 'in-page') => void;
  onTitle?: (title: string) => void;
  onStatus?: (status: WebviewStatus) => void;
  onFound?: (result: FindResult) => void;
}

interface CapturePoint {
  x: number;
  y: number;
  selection: string;
  host: string;
}

/**
 * The menu shown over a right-clicked selection.
 *
 * It reuses the shell's own context-menu styling rather than Electron's native
 * menu, so it follows the theme and the language like the rest of Kryvex.
 * Only the actions that make sense for the click are offered: a selection
 * that exists gets the two selection entries, a page without one gets the
 * whole-page entry alone.
 */
function CaptureMenu({
  point,
  onPick,
  onClose,
}: {
  point: CapturePoint;
  onPick: (mode: 'selection' | 'selection-and-page' | 'page') => void;
  onClose: () => void;
}) {
  const t = useT();
  const menu = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: point.x, y: point.y });

  useEffect(() => {
    const node = menu.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 10;
    setPosition({
      x: Math.max(margin, Math.min(point.x, window.innerWidth - rect.width - margin)),
      y: Math.max(margin, Math.min(point.y, window.innerHeight - rect.height - margin)),
    });
    node.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, point.x, point.y]);

  const item = (label: string, mode: 'selection' | 'selection-and-page' | 'page') => (
    <button
      type="button"
      role="menuitem"
      className="service-context-item"
      onClick={() => {
        onPick(mode);
        onClose();
      }}
    >
      <span className="service-context-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeLinecap="round" />
          <path d="m6.3 6.3 2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8m-5.8 5.8-2.8 2.8" strokeLinecap="round" />
        </svg>
      </span>
      <span className="service-context-copy">
        <strong>{label}</strong>
      </span>
    </button>
  );

  return createPortal(
    <div
      ref={menu}
      className="service-context"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={t('Send to Vexium')}
    >
      <header className="service-context-head">
        <span className="service-context-title">{t('Send to Vexium')}</span>
        <span className="mono service-context-host">{point.host}</span>
      </header>
      <div className="service-context-sep" role="separator" />
      {point.selection.trim()
        ? item(t('Send selection to Vexium'), 'selection')
        : null}
      {point.selection.trim()
        ? item(t('Send page and selection to Vexium'), 'selection-and-page')
        : null}
      {item(t('Send the whole page to Vexium'), 'page')}
    </div>,
    document.body,
  );
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
  onNavigate,
  onTitle,
  onStatus,
  onFound,
}: WebviewProps) {
  const ref = useRef<WebviewElement | null>(null);
  const initial = useRef({ src, partition, allowPopups });
  const [capture, setCapture] = useState<CapturePoint | null>(null);
  // The handler is kept in a ref so the guest listeners never need to be
  // torn down when a parent re-renders with a new callback identity.
  const sendRef = useRef(onSendToVexium);
  sendRef.current = onSendToVexium;

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
   * Send to Vexium: a menu over the right-clicked page.
   *
   * Electron reports the selection with the click, so the menu can show only
   * the entries that apply without reading the page first. The content itself
   * is read when an entry is chosen, which keeps a right-click cheap and makes
   * sure the user's latest selection is what travels.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || !onSendToVexium) return;
    const onMenu = (event: Event) => {
      const params = (event as Event & {
        params?: { x?: number; y?: number; selectionText?: string };
      }).params;
      if (!params) return;
      const rect = el.getBoundingClientRect();
      let host = '';
      try {
        host = new URL(el.getURL()).host;
      } catch {
        host = '';
      }
      setCapture({
        x: rect.left + Number(params.x ?? 0),
        y: rect.top + Number(params.y ?? 0),
        selection: String(params.selectionText ?? ''),
        host,
      });
    };
    el.addEventListener('context-menu', onMenu);
    return () => el.removeEventListener('context-menu', onMenu);
  }, [onSendToVexium]);

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
      {capture && sendRef.current ? (
        <CaptureMenu point={capture} onPick={mode => void pick(mode)} onClose={() => setCapture(null)} />
      ) : null}
    </>
  );
}
