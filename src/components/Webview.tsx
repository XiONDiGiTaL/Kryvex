import { createElement, useEffect, useRef, type MutableRefObject } from 'react';

export interface WebviewElement extends HTMLElement {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
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
  onNavigate?: (url: string) => void;
  onTitle?: (title: string) => void;
  onStatus?: (status: WebviewStatus) => void;
  onFound?: (result: FindResult) => void;
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
  onNavigate,
  onTitle,
  onStatus,
  onFound,
}: WebviewProps) {
  const ref = useRef<WebviewElement | null>(null);
  const initial = useRef({ src, partition, allowPopups });

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
      onNavigate?.(detail.url);
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
    el.addEventListener('did-navigate-in-page', onNavigated);
    el.addEventListener('page-title-updated', onTitleUpdated);
    el.addEventListener('found-in-page', onFoundInPage);
    el.addEventListener('did-fail-load', onFail);

    return () => {
      el.removeEventListener('dom-ready', attach);
      el.removeEventListener('did-start-loading', onStart);
      el.removeEventListener('did-stop-loading', onStop);
      el.removeEventListener('dom-ready', onReady);
      el.removeEventListener('did-navigate', onNavigated);
      el.removeEventListener('did-navigate-in-page', onNavigated);
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

  return createElement('webview', {
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
  });
}
