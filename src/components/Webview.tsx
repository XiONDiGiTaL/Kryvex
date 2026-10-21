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
      onStatus?.({
        loading,
        canGoBack: el.canGoBack(),
        canGoForward: el.canGoForward(),
        error,
      });
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
      onStatus?.({
        loading: false,
        canGoBack: el.canGoBack(),
        canGoForward: el.canGoForward(),
        error: detail.errorDescription ?? 'The page could not be loaded.',
      });
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
