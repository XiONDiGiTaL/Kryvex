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
  onNavigate?: (url: string) => void;
  onTitle?: (title: string) => void;
  onStatus?: (status: WebviewStatus) => void;
  onFound?: (result: FindResult) => void;
}

/**
 * Thin wrapper around Electron's <webview>. The element is created outside
 * JSX because React has no intrinsic tag for it; all hardening happens in the
 * main process, not here.
 */
export function Webview({
  src,
  partition,
  controller,
  onNavigate,
  onTitle,
  onStatus,
  onFound,
}: WebviewProps) {
  const ref = useRef<WebviewElement | null>(null);
  const initialSrc = useRef(src);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (controller) controller.current = el;

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
    src: initialSrc.current,
    partition,
    className: 'webview',
    allowpopups: undefined,
    webpreferences: 'contextIsolation=yes, nodeIntegration=no, sandbox=yes',
    style: { width: '100%', height: '100%' },
  });
}
