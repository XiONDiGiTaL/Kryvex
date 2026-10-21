import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  Bookmark,
  BrowserTab,
  DefaultBrowserStatus,
  DownloadRecord,
  HistoryEntry,
  PersistedState,
  PopupTabInfo,
  TorrentRecord,
} from '../types';
import { makeId } from '../lib/services';
import { extensionMessage, useI18n } from '../lib/i18n';
import { chromeWebStoreExtensionId, chromeWebStoreTitle } from '../lib/chrome-store';
import { hostOf, isHttpUrl, resolveAddress } from '../lib/url';
import { DEFAULT_ZOOM, canZoom, stepZoom } from '../lib/zoom';
import { Icon, Modal, ServiceIcon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import {
  Webview,
  type FindResult,
  type WebviewElement,
  type WebviewStatus,
} from '../components/Webview';

export type BrowserPanel = 'downloads' | 'history' | 'bookmarks';

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(amount) : amount >= 10 ? Math.round(amount) : amount.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

function formatDate(timestamp: number, locale: string): string {
  return new Date(timestamp).toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function downloadLabel(
  record: DownloadRecord,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (record.state) {
    case 'completed':
      return t('Complete');
    case 'paused':
      return t('Paused');
    case 'cancelled':
      return t('Cancelled');
    case 'interrupted':
      return t('Interrupted');
    default: {
      const percent = record.totalBytes > 0 ? Math.round((record.receivedBytes / record.totalBytes) * 100) : 0;
      return percent > 0 ? t('{percent}% complete', { percent }) : t('Downloading');
    }
  }
}

function downloadProgress(record: DownloadRecord): number {
  if (record.state === 'completed') return 100;
  if (record.totalBytes <= 0) return 0;
  return Math.min(100, Math.round((record.receivedBytes / record.totalBytes) * 100));
}

function finished(record: DownloadRecord): boolean {
  return record.state === 'completed' || record.state === 'cancelled' || record.state === 'interrupted';
}

function torrentLabel(
  record: TorrentRecord,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (record.state) {
    case 'metadata':
      return t('Waiting for metadata…');
    case 'paused':
      return t('Paused');
    case 'seeding':
      return t('Seeding');
    case 'error':
      return t('Error');
    default: {
      const percent = Math.round(record.progress * 100);
      return percent > 0 ? t('{percent}% complete', { percent }) : t('Downloading');
    }
  }
}

function torrentProgress(record: TorrentRecord): number {
  if (record.state === 'seeding') return 100;
  return Math.min(100, Math.max(0, Math.round(record.progress * 100)));
}

function formatSpeed(value: number): string {
  return value > 0 ? `${formatBytes(value)}/s` : '—';
}

function formatRemaining(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  const seconds = Math.max(1, Math.round(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function Browser({
  state,
  tabs,
  activeTabId,
  setTabs,
  setActiveTabId,
  initialTab = false,
  initialUrl = null,
  initialPanel = null,
  isElectron,
  engineRevision = 0,
  mark = 'kx',
  onAddBookmark,
  onRemoveBookmark,
  onAddHistory,
  onRemoveHistory,
  onClearHistory,
  onToast,
}: {
  state: PersistedState;
  tabs: BrowserTab[];
  activeTabId: string | null;
  setTabs: Dispatch<SetStateAction<BrowserTab[]>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
  initialTab?: boolean;
  initialUrl?: string | null;
  initialPanel?: BrowserPanel | null;
  isElectron: boolean;
  /** Remounts every page so changed engine preferences are attached. */
  engineRevision?: number;
  mark?: ThemeMarkKind;
  onAddBookmark: (bookmark: Bookmark) => void;
  onRemoveBookmark: (id: string) => void;
  onAddHistory: (entry: HistoryEntry) => void;
  onRemoveHistory: (id: string) => void;
  onClearHistory: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const { t, locale } = useI18n();
  // Popup tabs live in the main process: each one is a real popup window the
  // shell places over the canvas. The renderer keeps only their tab entries.
  const [popupTabs, setPopupTabs] = useState<PopupTabInfo[]>([]);
  const popupOpeners = useRef(new Map<string, string | null>());
  const activePopup = popupTabs.find(tab => tab.id === activeTabId) ?? null;
  const active = activePopup ? null : (tabs.find(tab => tab.id === activeTabId) ?? null);
  const currentUrl = active?.url ?? activePopup?.url ?? '';
  const currentTitle = active?.title ?? activePopup?.title ?? '';
  const tabsRef = useRef(tabs);
  const activeTabRef = useRef(activeTabId);
  tabsRef.current = tabs;
  activeTabRef.current = activeTabId;
  const [address, setAddress] = useState(active?.url ?? '');
  const [status, setStatus] = useState<WebviewStatus>({
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: null,
  });
  const [startQuery, setStartQuery] = useState('');
  const [panel, setPanel] = useState<BrowserPanel | null>(initialPanel);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [torrents, setTorrents] = useState<TorrentRecord[]>([]);
  const [magnetOpen, setMagnetOpen] = useState(false);
  const [magnet, setMagnet] = useState('');
  const [torrentBusy, setTorrentBusy] = useState(false);
  const [torrentRemove, setTorrentRemove] = useState<TorrentRecord | null>(null);
  const [browserStatus, setBrowserStatus] = useState<DefaultBrowserStatus | null>(null);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [storeBusy, setStoreBusy] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResult, setFindResult] = useState<FindResult>({ matches: 0, activeMatch: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const findInput = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const controllers = useRef(new Map<string, WebviewElement | null>());
  const openedInitial = useRef(false);
  const notifiedDownloads = useRef(new Set<string>());

  // Deep links: open a URL in a tab, or an empty tab during capture runs.
  useEffect(() => {
    if (openedInitial.current) return;
    if (initialUrl && isHttpUrl(initialUrl)) {
      openedInitial.current = true;
      const id = makeId('t');
      setTabs([{ id, url: initialUrl, title: hostOf(initialUrl) }]);
      setActiveTabId(id);
      return;
    }
    if (!initialTab || tabs.length > 0) return;
    openedInitial.current = true;
    const id = makeId('t');
    setTabs([{ id, url: '', title: t('New tab') }]);
    setActiveTabId(id);
  }, [initialTab, initialUrl, tabs.length, setTabs, setActiveTabId, t]);

  useEffect(() => {
    if (initialPanel) setPanel(initialPanel);
  }, [initialPanel]);

  useEffect(() => {
    setAddress(active?.url ?? '');
    setStatus({ loading: false, canGoBack: false, canGoForward: false, error: null });
  }, [active?.id, active?.url]);

  // Popup tabs: the main process announces each window it opens and the tab
  // strip mirrors it. Closing the popup — the provider finishes and calls
  // window.close() — returns to the tab that opened it.
  useEffect(() => {
    const bridge = window.kryvex;
    if (!bridge) return;
    let live = true;
    void bridge.popupsList().then(list => {
      if (!live || list.length === 0) return;
      setPopupTabs(current => {
        const known = new Set(current.map(tab => tab.id));
        return [...current, ...list.filter(tab => !known.has(tab.id))];
      });
    });
    const stopOpened = bridge.onPopupOpened(popup => {
      popupOpeners.current.set(popup.id, activeTabRef.current);
      setPopupTabs(current => [...current.filter(tab => tab.id !== popup.id), popup]);
      setActiveTabId(popup.id);
    });
    const stopChanged = bridge.onPopupChanged(popup => {
      setPopupTabs(current => current.map(tab => (tab.id === popup.id ? popup : tab)));
    });
    const stopClosed = bridge.onPopupClosed(({ id }) => {
      const opener = popupOpeners.current.get(id) ?? null;
      popupOpeners.current.delete(id);
      setPopupTabs(current => current.filter(tab => tab.id !== id));
      setActiveTabId(current => {
        if (current !== id) return current;
        if (opener && tabsRef.current.some(tab => tab.id === opener)) return opener;
        return tabsRef.current[tabsRef.current.length - 1]?.id ?? null;
      });
    });
    return () => {
      live = false;
      stopOpened();
      stopChanged();
      stopClosed();
    };
  }, [setActiveTabId]);

  // Only the selected popup is visible: another tab, or another popup, leaves
  // the canvas to the page underneath.
  useEffect(() => {
    const bridge = window.kryvex;
    if (!bridge) return;
    if (!activePopup) {
      void bridge.popupsHideAll();
      return;
    }
    void bridge.popupsShow(activePopup.id);
  }, [activePopup]);

  useEffect(() => {
    if (!activePopup) return;
    setAddress(activePopup.url);
    setStatus({
      loading: activePopup.loading,
      canGoBack: activePopup.canGoBack,
      canGoForward: activePopup.canGoForward,
      error: null,
    });
  }, [activePopup]);

  // The popup is a real window placed over the canvas, so the renderer owns the
  // geometry: report it on mount, on resize, when the library panel opens, and
  // when an ancestor scrolls.
  useEffect(() => {
    const bridge = window.kryvex;
    const node = canvasRef.current;
    if (!bridge || !node) return;
    const report = () => {
      const rect = node.getBoundingClientRect();
      bridge.popupsCanvas({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    window.addEventListener('resize', report);
    window.addEventListener('scroll', report, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      window.removeEventListener('scroll', report, true);
      bridge.popupsCanvas(null);
    };
  }, []);

  // Each tab keeps its own page zoom; Kryvex only remembers it for the session.
  useEffect(() => {
    const controller = active ? controllers.current.get(active.id) : null;
    if (!controller) return;
    try {
      setZoom(controller.getZoomFactor());
    } catch {
      setZoom(DEFAULT_ZOOM);
    }
  }, [active?.id]);

  useEffect(() => {
    if (findOpen) findInput.current?.focus();
  }, [findOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'f' && active?.url) {
        event.preventDefault();
        setFindOpen(true);
      }
      if (key === '=' || key === '+') {
        event.preventDefault();
        changeZoom(1);
      }
      if (key === '-') {
        event.preventDefault();
        changeZoom(-1);
      }
      if (key === '0') {
        event.preventDefault();
        const controller = active ? controllers.current.get(active.id) : null;
        try {
          controller?.setZoomFactor(DEFAULT_ZOOM);
          setZoom(DEFAULT_ZOOM);
        } catch {
          /* the page may already be gone */
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // changeZoom is intentionally re-bound each render so it reads current zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.url]);

  useEffect(() => {
    if (!findOpen) {
      const controller = active ? controllers.current.get(active.id) : null;
      try {
        controller?.stopFindInPage('clearSelection');
      } catch {
        /* the page may already be gone */
      }
      setFindResult({ matches: 0, activeMatch: 0 });
    }
  }, [active?.id, findOpen]);

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;

    void window.kryvex
      .downloadsList()
      .then(records => {
        if (!alive) return;
        records.forEach(record => notifiedDownloads.current.add(record.id));
        setDownloads(records);
      })
      .catch(() => undefined);

    const stop = window.kryvex.onDownloadsChanged(records => {
      if (!alive) return;
      setDownloads(records);
      for (const record of records) {
        if (notifiedDownloads.current.has(record.id) || !finished(record)) continue;
        notifiedDownloads.current.add(record.id);
        if (record.state === 'completed') {
          onToast(t('{name} downloaded.', { name: record.filename }), 'success');
        } else if (record.state === 'interrupted') {
          onToast(t('{name} was interrupted.', { name: record.filename }), 'warning');
        }
      }
    });

    return () => {
      alive = false;
      stop();
    };
  }, [isElectron, onToast, t]);

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    void window.kryvex
      .torrentsList()
      .then(records => {
        if (alive) setTorrents(records);
      })
      .catch(() => undefined);
    const stop = window.kryvex.onTorrentsChanged(records => {
      if (alive) setTorrents(records);
    });
    return () => {
      alive = false;
      stop();
    };
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    void window.kryvex
      .defaultBrowserStatus()
      .then(next => {
        if (alive) setBrowserStatus(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isElectron]);

  const bookmarked = useMemo(
    () => (currentUrl ? state.bookmarks.some(bookmark => bookmark.url === currentUrl) : false),
    [currentUrl, state.bookmarks],
  );

  const visibleHistory = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return state.history;
    return state.history.filter(entry =>
      `${entry.title} ${entry.url}`.toLowerCase().includes(query),
    );
  }, [historyQuery, state.history]);

  const activeDownloads = downloads.filter(
    record => record.state === 'progressing' || record.state === 'paused',
  ).length;
  const finishedDownloads = downloads.filter(finished).length;
  const storeId = active?.url ? chromeWebStoreExtensionId(active.url) : null;
  const storeName = active?.title ? chromeWebStoreTitle(active.title) : t('Chrome Web Store');

  async function installStoreExtension() {
    if (!window.kryvex || !storeId) return;
    setStoreBusy(true);
    try {
      const result = await window.kryvex.extensionsInstallWebStore(storeId);
      if (result.ok) {
        onToast(t('Extension installed. Reload this page to use it.'), 'success');
        if (active) controllers.current.get(active.id)?.reload();
      } else {
        onToast(extensionMessage(t, result.message), 'danger');
      }
    } catch {
      onToast(t('Could not install this extension.'), 'danger');
    } finally {
      setStoreBusy(false);
    }
  }

  function updateActive(patch: Partial<BrowserTab>) {
    if (!active) return;
    setTabs(current => current.map(tab => (tab.id === active.id ? { ...tab, ...patch } : tab)));
  }

  function navigateTo(url: string, title?: string) {
    if (!url) return;
    if (!active) {
      const id = makeId('t');
      setTabs(current => [...current, { id, url, title: title || hostOf(url) }]);
      setActiveTabId(id);
      return;
    }
    const controller = controllers.current.get(active.id);
    updateActive({ url, title: title || hostOf(url) });
    setAddress(url);
    if (controller) {
      // HTTPS upgrades, tracking-parameter redirects and the one-time HTTP
      // fallback can reject the original loadURL promise while the rewritten
      // page still loads. The webview's did-fail-load state is the source of
      // truth for real failures, so a redirect must not raise a false toast.
      void controller.loadURL(url).catch(() => undefined);
    }
  }

  function go(raw: string) {
    const url = resolveAddress(raw, state.settings.searchEngine);
    if (!url || url === 'about:blank') return;
    navigateTo(url);
  }

  function newTab() {
    const id = makeId('t');
    setTabs(current => [...current, { id, url: '', title: t('New tab') }]);
    setActiveTabId(id);
  }

  function closeTab(id: string) {
    const remaining = tabs.filter(tab => tab.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[remaining.length - 1]?.id ?? null);
    }
    controllers.current.delete(id);
    // The tab partition is in-memory; clearing after unmount removes any
    // renderer-held state that Chromium has not released yet.
    window.setTimeout(() => void window.kryvex?.browserClearTab(`browser-${id}`), 250);
  }

  function recordVisit(url: string, title?: string) {
    if (!isHttpUrl(url)) return;
    onAddHistory({
      id: makeId('h'),
      url,
      title: title?.trim() || hostOf(url),
      visitedAt: Date.now(),
    });
  }

  function openHistory(entry: HistoryEntry) {
    navigateTo(entry.url, entry.title);
  }

  function togglePanel(next: BrowserPanel) {
    setPanel(current => (current === next ? null : next));
  }

  function runFind(raw: string, forward = true, findNext = false) {
    const controller = active ? controllers.current.get(active.id) : null;
    if (!controller) return;
    if (!raw) {
      try {
        controller.stopFindInPage('clearSelection');
      } catch {
        /* ignore */
      }
      setFindResult({ matches: 0, activeMatch: 0 });
      return;
    }
    try {
      // Passing an explicit `findNext: false` can swallow the first result in
      // Electron's webview bridge, so a fresh search uses the plain call.
      if (findNext) controller.findInPage(raw, { forward, findNext });
      else controller.findInPage(raw);
    } catch {
      onToast(t('Find is not available on this page.'), 'warning');
    }
  }

  function changeFind(value: string) {
    setFindQuery(value);
    runFind(value, true, false);
  }

  function closeFind() {
    setFindOpen(false);
    setFindQuery('');
  }

  function changeZoom(direction: 1 | -1) {
    const controller = active ? controllers.current.get(active.id) : null;
    if (!controller) return;
    let current = zoom;
    try {
      current = controller.getZoomFactor();
    } catch {
      /* fall back to the last known factor */
    }
    const next = stepZoom(current, direction);
    try {
      controller.setZoomFactor(next);
      setZoom(next);
    } catch {
      onToast(t('Zoom could not be changed on this page.'), 'warning');
    }
  }

  async function makeDefault() {
    if (!window.kryvex) return;
    setBrowserBusy(true);
    try {
      const next = await window.kryvex.defaultBrowserSet();
      setBrowserStatus(next);
      onToast(
        next.isDefault
          ? t('Kryvex is now the default browser.')
          : t('Windows Default Apps opened. Choose Kryvex for http and https links.'),
        next.isDefault ? 'success' : 'info',
      );
    } catch {
      onToast(t('Could not open the default-browser settings.'), 'danger');
    } finally {
      setBrowserBusy(false);
    }
  }

  async function openDefaultSettings() {
    if (!window.kryvex) return;
    const opened = await window.kryvex.openDefaultApps();
    if (!opened) onToast(t('Windows Default Apps could not be opened.'), 'danger');
  }

  async function pauseDownload(record: DownloadRecord) {
    if (!window.kryvex) return;
    const ok = await window.kryvex.downloadsPause(record.id);
    if (!ok) onToast(t('That download is no longer running.'), 'warning');
  }

  async function cancelDownload(record: DownloadRecord) {
    if (!window.kryvex) return;
    const ok = await window.kryvex.downloadsCancel(record.id);
    onToast(
      ok
        ? t('{name} cancelled.', { name: record.filename })
        : t('That download is no longer running.'),
      ok ? 'warning' : 'danger',
    );
  }

  async function showDownload(record: DownloadRecord) {
    if (!window.kryvex) return;
    const ok = await window.kryvex.downloadsShow(record.id);
    if (!ok) onToast(t('The downloaded file is no longer in its folder.'), 'warning');
  }

  async function openDownload(record: DownloadRecord) {
    if (!window.kryvex) return;
    const ok = await window.kryvex.downloadsOpen(record.id);
    if (!ok) onToast(t('The file could not be opened. It may have been moved or deleted.'), 'warning');
  }

  async function removeDownload(record: DownloadRecord, deleteFile: boolean) {
    if (!window.kryvex) return;
    const result = await window.kryvex.downloadsRemove(record.id, deleteFile);
    setDownloads(result.records);
    onToast(result.message, result.ok ? (deleteFile ? 'warning' : 'info') : 'danger');
  }

  async function clearFinishedDownloads() {
    if (!window.kryvex) return;
    const records = await window.kryvex.downloadsClear();
    setDownloads(records);
    onToast(t('Finished downloads cleared.'), 'info');
  }

  async function addMagnet() {
    if (!window.kryvex || !magnet.trim() || torrentBusy) return;
    setTorrentBusy(true);
    try {
      const result = await window.kryvex.torrentsAddMagnet(magnet.trim());
      setTorrents(result.records);
      onToast(t(result.message), result.ok ? 'success' : 'danger');
      if (result.ok) {
        setMagnet('');
        setMagnetOpen(false);
        setPanel('downloads');
      }
    } catch {
      onToast(t('The torrent could not be added.'), 'danger');
    } finally {
      setTorrentBusy(false);
    }
  }

  async function addTorrentFile() {
    if (!window.kryvex || torrentBusy) return;
    setTorrentBusy(true);
    try {
      const result = await window.kryvex.torrentsAddFile();
      setTorrents(result.records);
      onToast(t(result.message), result.ok ? 'success' : result.message === 'Selection cancelled.' ? 'info' : 'danger');
    } catch {
      onToast(t('The torrent file could not be added.'), 'danger');
    } finally {
      setTorrentBusy(false);
    }
  }

  async function toggleTorrent(record: TorrentRecord) {
    if (!window.kryvex) return;
    const result =
      record.state === 'paused'
        ? await window.kryvex.torrentsResume(record.id)
        : await window.kryvex.torrentsPause(record.id);
    setTorrents(result.records);
    onToast(t(result.message), result.ok ? 'info' : 'danger');
  }

  async function showTorrent(record: TorrentRecord) {
    if (!window.kryvex) return;
    const ok = await window.kryvex.torrentsShow(record.id);
    if (!ok) onToast(t('That torrent folder is not available.'), 'warning');
  }

  async function copyMagnet(record: TorrentRecord) {
    if (!record.magnetURI) return;
    try {
      await navigator.clipboard.writeText(record.magnetURI);
      onToast(t('Magnet link copied.'), 'success');
    } catch {
      onToast(t('The magnet link could not be copied.'), 'danger');
    }
  }

  async function removeTorrent(record: TorrentRecord, deleteData: boolean) {
    if (!window.kryvex) return;
    setTorrentRemove(null);
    const result = await window.kryvex.torrentsRemove(record.id, deleteData);
    setTorrents(result.records);
    onToast(t(result.message), result.ok ? (deleteData ? 'warning' : 'info') : 'danger');
  }

  const defaultText = !browserStatus
    ? t('Checking Windows Default Apps…')
    : browserStatus.isDefault
      ? t('Kryvex handles http and https links from Windows.')
      : browserStatus.detail ?? t('Windows will ask you to confirm.');

  return (
    <section className="view browser-view">
      <div className="tab-strip" role="tablist" aria-label={t('Browser tabs')}>
        {tabs.map(tab => (
          <div key={tab.id} className={`tab ${tab.id === activeTabId ? 'is-active' : ''}`}>
            <button
              role="tab"
              aria-selected={tab.id === activeTabId}
              className="tab-label"
              onClick={() => setActiveTabId(tab.id)}
              title={tab.url || tab.title}
            >
              <span className="tab-dot" aria-hidden="true" />
              <span className="tab-title">{tab.title || t('New tab')}</span>
            </button>
            <button
              className="tab-close"
              onClick={() => closeTab(tab.id)}
              aria-label={t('Close {name}', { name: tab.title || t('tab') })}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
        {popupTabs.map(tab => (
          <div
            key={tab.id}
            className={`tab is-popup ${tab.id === activeTabId ? 'is-active' : ''}`}
          >
            <button
              role="tab"
              aria-selected={tab.id === activeTabId}
              className="tab-label"
              onClick={() => setActiveTabId(tab.id)}
              title={tab.url || tab.title || t('Pop-up')}
            >
              <span className="tab-dot" aria-hidden="true" />
              <span className="tab-popup-mark" aria-hidden="true">
                <Icon name="external" size={11} />
              </span>
              <span className="tab-title">{tab.title || t('Pop-up')}</span>
            </button>
            <button
              className="tab-close"
              onClick={() => void window.kryvex?.popupsClose(tab.id)}
              aria-label={t('Close {name}', { name: tab.title || t('Pop-up') })}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
        <button className="new-tab-btn" onClick={newTab} aria-label={t('New tab')} title={t('New tab')}>
          <Icon name="plus" size={15} />
        </button>

        <div className="tab-spacer" />

        <button
          className={`icon-btn ${bookmarked ? 'is-on' : ''}`}
          disabled={!currentUrl}
          onClick={() => {
            if (!currentUrl) return;
            if (bookmarked) {
              const existing = state.bookmarks.find(bookmark => bookmark.url === currentUrl);
              if (existing) {
                onRemoveBookmark(existing.id);
                onToast(t('Bookmark removed.'), 'info');
              }
            } else {
              onAddBookmark({
                id: makeId('b'),
                url: currentUrl,
                title: currentTitle || hostOf(currentUrl),
                createdAt: Date.now(),
              });
              onToast(t('Bookmark saved.'), 'success');
            }
          }}
          aria-label={bookmarked ? t('Remove bookmark') : t('Bookmark this page')}
          title={bookmarked ? t('Remove bookmark') : t('Bookmark this page')}
        >
          <Icon name="bookmark" size={15} />
        </button>
      </div>

      <div className="browser-toolbar">
        <button
          className="icon-btn"
          disabled={!status.canGoBack}
          onClick={() =>
            activePopup
              ? void window.kryvex?.popupsAction(activePopup.id, 'back')
              : controllers.current.get(active?.id ?? '')?.goBack()
          }
          aria-label={t('Back')}
        >
          <Icon name="back" size={16} />
        </button>
        <button
          className="icon-btn"
          disabled={!status.canGoForward}
          onClick={() =>
            activePopup
              ? void window.kryvex?.popupsAction(activePopup.id, 'forward')
              : controllers.current.get(active?.id ?? '')?.goForward()
          }
          aria-label={t('Forward')}
        >
          <Icon name="forward" size={16} />
        </button>
        <button
          className="icon-btn"
          onClick={() =>
            activePopup
              ? void window.kryvex?.popupsAction(activePopup.id, 'reload')
              : controllers.current.get(active?.id ?? '')?.reload()
          }
          disabled={!currentUrl}
          aria-label={t('Reload')}
        >
          <Icon name="reload" size={16} />
        </button>

        <form
          className="address-bar"
          onSubmit={event => {
            event.preventDefault();
            go(address);
          }}
        >
          <Icon name="globe" size={14} />
          <input
            value={address}
            onChange={event => setAddress(event.target.value)}
            placeholder={t('Search or enter an address')}
            spellCheck={false}
            aria-label={t('Address bar')}
          />
          {address ? (
            <button
              type="button"
              className="icon-btn tiny"
              onClick={() => setAddress('')}
              aria-label={t('Clear address')}
            >
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </form>

        <button
          className="icon-btn"
          onClick={() => {
            if (!active?.url) return;
            void window.kryvex?.openExternal(active.url);
            onToast(t('Opened in your default browser.'), 'info');
          }}
          disabled={!active?.url}
          aria-label={t('Open in system browser')}
          title={t('Open in system browser')}
        >
          <Icon name="external" size={15} />
        </button>

        <div className="browser-zoom" aria-label={t('Zoom')}>
          <button
            className="icon-btn tiny"
            disabled={!active?.url || !canZoom(zoom, -1)}
            onClick={() => changeZoom(-1)}
            aria-label={t('Zoom out')}
            title={t('Zoom out')}
          >
            −
          </button>
          <button
            className="zoom-value mono"
            disabled={!active?.url}
            onClick={() => {
              const controller = active ? controllers.current.get(active.id) : null;
              try {
                controller?.setZoomFactor(DEFAULT_ZOOM);
                setZoom(DEFAULT_ZOOM);
              } catch {
                onToast(t('Zoom could not be changed on this page.'), 'warning');
              }
            }}
            aria-label={t('Reset zoom')}
            title={t('Reset zoom')}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="icon-btn tiny"
            disabled={!active?.url || !canZoom(zoom, 1)}
            onClick={() => changeZoom(1)}
            aria-label={t('Zoom in')}
            title={t('Zoom in')}
          >
            +
          </button>
        </div>

        <button
          className={`icon-btn ${findOpen ? 'is-on' : ''}`}
          disabled={!active?.url}
          onClick={() => setFindOpen(open => !open)}
          aria-label={t('Find in page')}
          title={t('Find in page')}
        >
          <Icon name="search" size={15} />
        </button>

        <div className="browser-library-toggles" aria-label={t('Browser library')}>
          <button
            className={`icon-btn ${panel === 'downloads' ? 'is-on' : ''}`}
            onClick={() => togglePanel('downloads')}
            aria-label={t('Downloads')}
            title={t('Downloads')}
          >
            <Icon name="download" size={15} />
            {downloads.length > 0 ? <span className="browser-count">{downloads.length}</span> : null}
          </button>
          <button
            className={`icon-btn ${panel === 'history' ? 'is-on' : ''}`}
            onClick={() => togglePanel('history')}
            aria-label={t('History')}
            title={t('History')}
          >
            <Icon name="history" size={15} />
          </button>
          <button
            className={`icon-btn ${panel === 'bookmarks' ? 'is-on' : ''}`}
            onClick={() => togglePanel('bookmarks')}
            aria-label={t('Bookmarks')}
            title={t('Bookmarks')}
          >
            <Icon name="bookmark" size={15} />
          </button>
        </div>
      </div>

      {findOpen ? (
        <div className="find-bar" role="search" aria-label={t('Find in page')}>
          <Icon name="search" size={13} />
          <input
            ref={findInput}
            value={findQuery}
            onChange={event => changeFind(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                runFind(findQuery, !event.shiftKey, true);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                closeFind();
              }
            }}
            placeholder={t('Find in page')}
            aria-label={t('Find in page')}
            spellCheck={false}
          />
          <span className="mono find-count">
            {findQuery
              ? findResult.matches > 0
                ? t('{active} of {count}', {
                    active: findResult.activeMatch,
                    count: findResult.matches,
                  })
                : t('No matches')
              : ''}
          </span>
          <button
            className="icon-btn tiny"
            disabled={!findQuery || findResult.matches === 0}
            onClick={() => runFind(findQuery, false, true)}
            aria-label={t('Previous match')}
            title={t('Previous match')}
          >
            <Icon name="back" size={12} />
          </button>
          <button
            className="icon-btn tiny"
            disabled={!findQuery || findResult.matches === 0}
            onClick={() => runFind(findQuery, true, true)}
            aria-label={t('Next match')}
            title={t('Next match')}
          >
            <Icon name="forward" size={12} />
          </button>
          <button
            className="icon-btn tiny"
            onClick={closeFind}
            aria-label={t('Close find')}
            title={t('Close find')}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ) : null}

      {storeId ? (
        <div className="store-install-banner" role="region" aria-label={t('Chrome Web Store')}>
          <span className="store-install-mark">
            <Icon name="plus" size={16} />
          </span>
          <div className="store-install-copy">
            <strong>{t('Install this extension in Kryvex')}</strong>
            <p>
              {storeName} ·{' '}
              {t('Kryvex can install this Chrome extension for all of your tabs and services.')}
            </p>
          </div>
          <button
            className="btn primary small"
            disabled={storeBusy}
            onClick={() => void installStoreExtension()}
          >
            <Icon name="download" size={13} />
            {storeBusy ? t('Installing…') : t('Install extension')}
          </button>
        </div>
      ) : null}

      {state.bookmarks.length > 0 ? (
        <div className="bookmarks-bar">
          {state.bookmarks.slice(0, 8).map(bookmark => (
            <span key={bookmark.id} className="bookmark-chip">
              <button onClick={() => navigateTo(bookmark.url, bookmark.title)} title={bookmark.url}>
                <span className="bookmark-dot" aria-hidden="true" />
                {bookmark.title}
              </button>
              <button
                className="bookmark-remove"
                onClick={() => onRemoveBookmark(bookmark.id)}
                aria-label={t('Remove bookmark {name}', { name: bookmark.title })}
              >
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="browser-body">
        <div className="browser-canvas" ref={canvasRef}>
          {status.loading && !status.error ? <div className="loading-bar" aria-hidden="true" /> : null}

          {activePopup ? (
            // The popup window covers this area while it is selected; the note
            // is what remains if the window could not be shown.
            <div className="browser-popup-note">
              <Icon name="external" size={20} />
              <p>{t('This sign-in window is open as a tab.')}</p>
            </div>
          ) : null}

          {!activePopup && (!active || active.url === '') ? (
            <div className="browser-start">
              <ThemeMark mark={mark} size={64} variant="tile" />
              <h2>{active ? t('Where to?') : t('No tabs open')}</h2>
              <p>
                {t(
                  'Search the web, open one of your modules, or start from a bookmark. Downloads and history stay in the library beside the page.',
                )}
              </p>
              <form
                className="start-search"
                onSubmit={event => {
                  event.preventDefault();
                  if (!startQuery.trim()) return;
                  go(startQuery);
                  setStartQuery('');
                }}
              >
                <Icon name="search" size={15} />
                <input
                  autoFocus
                  value={startQuery}
                  onChange={event => setStartQuery(event.target.value)}
                  placeholder={t('Search with {engine}', { engine: state.settings.searchEngine })}
                  aria-label={t('Search the web')}
                />
                <button type="submit" className="btn secondary small">
                  {t('Go')}
                </button>
              </form>

              <div className="start-links">
                {state.services.slice(0, 6).map(service => (
                  <button key={service.id} className="start-link" onClick={() => go(service.url)}>
                    <ServiceIcon service={service} size={22} />
                    <span>{service.name}</span>
                    <span className="mono">{hostOf(service.url)}</span>
                  </button>
                ))}
              </div>

              {state.bookmarks.length > 0 ? (
                <div className="start-links">
                  {state.bookmarks.slice(0, 4).map(bookmark => (
                    <button
                      key={bookmark.id}
                      className="start-link"
                      onClick={() => navigateTo(bookmark.url, bookmark.title)}
                    >
                      <Icon name="bookmark" size={16} />
                      <span>{bookmark.title}</span>
                      <span className="mono">{hostOf(bookmark.url)}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {isElectron ? (
                <div className="default-browser-card">
                  <span className="default-browser-mark">
                    <Icon name="globe" size={18} />
                  </span>
                  <div className="default-browser-copy">
                    <strong>{t('Make Kryvex your default browser')}</strong>
                    <p>{defaultText}</p>
                  </div>
                  <div className="default-browser-actions">
                    <button
                      className="btn secondary small"
                      disabled={browserBusy || Boolean(browserStatus?.isDefault) || !browserStatus?.canRegister}
                      onClick={() => void makeDefault()}
                    >
                      <Icon name={browserStatus?.isDefault ? 'check' : 'globe'} size={13} />
                      {browserStatus?.isDefault
                        ? t('Default browser')
                        : browserBusy
                          ? t('Opening…')
                          : t('Set as default')}
                    </button>
                    {browserStatus && !browserStatus.isDefault && browserStatus.supported ? (
                      <button className="link" onClick={() => void openDefaultSettings()}>
                        {t('Windows settings')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {!isElectron && active?.url ? (
            <div className="webview-fallback compact">
              <Icon name="globe" size={28} />
              <h2>{t('Browser engine loads in the desktop shell')}</h2>
              <p>
                {t(
                  'Chromium webviews are available in the Electron app. This preview shows the browser chrome only.',
                )}
              </p>
              <a className="btn secondary" href={active.url} target="_blank" rel="noreferrer">
                {t('Open {host}', { host: hostOf(active.url) })}
              </a>
            </div>
          ) : null}

          {isElectron
            ? tabs
                .filter(tab => tab.url !== '')
                .map(tab => (
                  <div
                    key={tab.id}
                    className={`browser-page ${tab.id === activeTabId ? '' : 'is-hidden'}`}
                    aria-hidden={tab.id !== activeTabId}
                  >
                    <Webview
                      key={`${tab.id}-${engineRevision}`}
                      src={tab.url}
                      partition={`browser-${tab.id}`}
                      // Sign-in popups must reach the main process, which turns
                      // them into in-app tabs; without this Electron refuses
                      // window.open before the handler is consulted.
                      allowPopups
                      controller={{
                        get current() {
                          return controllers.current.get(tab.id) ?? null;
                        },
                        set current(value) {
                          controllers.current.set(tab.id, value);
                        },
                      }}
                      onStatus={value => {
                        if (tab.id !== activeTabId) return;
                        setStatus(value);
                        // The engine's default zoom applies at attach time, so
                        // the toolbar reads the real factor once a page settles.
                        if (value.loading || value.error) return;
                        try {
                          setZoom(controllers.current.get(tab.id)?.getZoomFactor() ?? DEFAULT_ZOOM);
                        } catch {
                          /* the guest may already be gone */
                        }
                      }}
                      onNavigate={url => {
                        setTabs(current =>
                          current.map(item =>
                            item.id === tab.id
                              ? {
                                  ...item,
                                  url,
                                  title:
                                    item.title === 'New tab' || item.title === t('New tab')
                                      ? hostOf(url)
                                      : item.title,
                                }
                              : item,
                          ),
                        );
                        if (tab.id === activeTabId) {
                          setAddress(url);
                          recordVisit(url);
                        }
                      }}
                      onTitle={title => {
                        setTabs(current =>
                          current.map(item => (item.id === tab.id ? { ...item, title } : item)),
                        );
                      }}
                      onFound={result => {
                        if (tab.id === activeTabId) setFindResult(result);
                      }}
                    />
                  </div>
                ))
            : null}

          {active?.url && status.error ? (
            <div className="webview-error" role="alert">
              <Icon name="shield" size={22} />
              <h3>{t('This page did not load')}</h3>
              <p>{status.error}</p>
              <div className="error-actions">
                <button
                  className="btn primary"
                  onClick={() => controllers.current.get(active.id)?.reload()}
                >
                  {t('Try again')}
                </button>
                <button
                  className="btn secondary"
                  onClick={() => {
                    void window.kryvex?.openExternal(active.url);
                  }}
                >
                  {t('Open externally')}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {panel ? (
          <aside className="browser-panel" aria-label={t('Browser library')}>
            <div className="browser-panel-head">
              <div className="browser-panel-tabs" role="tablist" aria-label={t('Browser library sections')}>
                {([
                  ['downloads', t('Downloads'), downloads.length],
                  ['history', t('History'), state.history.length],
                  ['bookmarks', t('Bookmarks'), state.bookmarks.length],
                ] as const).map(([id, label, count]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={panel === id}
                    className={`browser-panel-tab ${panel === id ? 'is-active' : ''}`}
                    onClick={() => setPanel(id)}
                  >
                    {label}
                    <span className="mono">{count}</span>
                  </button>
                ))}
              </div>
              <button
                className="icon-btn tiny"
                onClick={() => setPanel(null)}
                aria-label={t('Close browser library')}
              >
                <Icon name="close" size={12} />
              </button>
            </div>

            {panel === 'downloads' ? (
              <div className="browser-panel-body">
                <div className="torrent-hub">
                  <div className="browser-panel-toolbar">
                    <span className="mono muted-label">
                      {t('{count} TORRENTS', { count: torrents.length })}
                    </span>
                    <div className="torrent-add-actions">
                      <button
                        className="link"
                        onClick={() => setMagnetOpen(open => !open)}
                        aria-expanded={magnetOpen}
                      >
                        {t('Magnet link')}
                      </button>
                      <button
                        className="link"
                        disabled={torrentBusy}
                        onClick={() => void addTorrentFile()}
                      >
                        {t('Open .torrent')}
                      </button>
                    </div>
                  </div>
                  <p className="torrent-legal">
                    {t(
                      'Kryvex does not host, index or recommend torrents. Add only content you have the right to download.',
                    )}
                  </p>
                  {magnetOpen ? (
                    <form
                      className="torrent-magnet"
                      onSubmit={event => {
                        event.preventDefault();
                        void addMagnet();
                      }}
                    >
                      <input
                        value={magnet}
                        onChange={event => setMagnet(event.target.value)}
                        placeholder="magnet:?xt=urn:btih:…"
                        spellCheck={false}
                        aria-label={t('Paste a magnet link')}
                      />
                      <button className="btn secondary small" disabled={torrentBusy || !magnet.trim()}>
                        {t('Add')}
                      </button>
                    </form>
                  ) : null}
                  {torrents.length === 0 ? (
                    <p className="torrent-empty">
                      {t('No torrents yet. Open a magnet link or .torrent file to add one.')}
                    </p>
                  ) : (
                    <ul className="browser-list torrent-list">
                      {torrents.map(record => (
                        <li key={record.id} className="torrent-item">
                          <span className="browser-item-icon">
                            <Icon name="download" size={15} />
                          </span>
                          <div className="browser-item-main">
                            <strong title={record.name}>{record.name}</strong>
                            <span className="mono browser-item-source">
                              {record.infoHash ? `${record.infoHash.slice(0, 12)}…` : t('Reading metadata…')}
                              {' · '}
                              {record.source === 'magnet' ? t('Magnet') : t('.torrent file')}
                            </span>
                            <div className="download-meta">
                              <span className={`download-state is-${record.state}`}>
                                {torrentLabel(record, t)}
                              </span>
                              <span className="mono">
                                {record.length > 0
                                  ? `${formatBytes(record.downloaded)} / ${formatBytes(record.length)}`
                                  : t('Reading metadata…')}
                              </span>
                            </div>
                            <div
                              className="download-progress"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={torrentProgress(record)}
                            >
                              <span style={{ width: `${torrentProgress(record)}%` }} />
                            </div>
                            <div className="torrent-stats mono">
                              <span title={t('Seeders')}>S {record.seeders}</span>
                              <span title={t('Leechers')}>L {record.leechers}</span>
                              <span title={t('Peers')}>P {record.peers}</span>
                              <span title={t('Download speed')}>↓ {formatSpeed(record.downloadSpeed)}</span>
                              <span title={t('Upload speed')}>↑ {formatSpeed(record.uploadSpeed)}</span>
                              <span title={t('Ratio')}>R {record.ratio.toFixed(2)}</span>
                              <span title={t('Time remaining')}>{formatRemaining(record.timeRemaining)}</span>
                            </div>
                            <div className="torrent-protocols mono">
                              {record.protocols.join(' · ') || t('BitTorrent')}
                            </div>
                            {record.error ? <p className="torrent-error">{t(record.error)}</p> : null}
                            <details className="torrent-details">
                              <summary className="mono">
                                {t('{count} files', { count: record.files.length })} ·{' '}
                                {t('{count} trackers', { count: record.trackers.length })}
                              </summary>
                              {record.files.length > 0 ? (
                                <ul className="torrent-files">
                                  {record.files.slice(0, 24).map(file => (
                                    <li key={file.path} title={file.path}>
                                      <span>{file.name}</span>
                                      <span className="mono">{formatBytes(file.length)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                              {record.trackers.length > 0 ? (
                                <div className="torrent-trackers">
                                  <span className="mono">{t('Trackers')}</span>
                                  {record.trackers.slice(0, 6).map(tracker => (
                                    <span key={tracker} className="mono torrent-tracker" title={tracker}>
                                      {hostOf(tracker)}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </details>
                            <div className="download-actions">
                              {record.state !== 'error' ? (
                                <button className="link" onClick={() => void toggleTorrent(record)}>
                                  {record.state === 'paused' ? t('Resume') : t('Pause')}
                                </button>
                              ) : null}
                              <button className="link" onClick={() => void showTorrent(record)}>
                                {t('Show in folder')}
                              </button>
                              {record.magnetURI ? (
                                <button className="link" onClick={() => void copyMagnet(record)}>
                                  {t('Copy magnet')}
                                </button>
                              ) : null}
                              <button
                                className="link danger-link"
                                onClick={() => setTorrentRemove(record)}
                              >
                                {t('Remove')}
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="torrent-divider" />
                <div className="browser-panel-toolbar">
                  <span className="mono muted-label">
                    {activeDownloads > 0
                      ? t('{count} ACTIVE', { count: activeDownloads })
                      : t('{count} FINISHED', { count: finishedDownloads })}
                  </span>
                  <button
                    className="link"
                    disabled={finishedDownloads === 0}
                    onClick={() => void clearFinishedDownloads()}
                  >
                    {t('Clear finished')}
                  </button>
                </div>
                {downloads.length === 0 ? (
                  <div className="browser-panel-empty">
                    <Icon name="download" size={26} />
                    <strong>{t('No downloads yet')}</strong>
                    <p>
                      {t(
                        'Files you download from any tab or service appear here with live status.',
                      )}
                    </p>
                  </div>
                ) : (
                  <ul className="browser-list">
                    {downloads.map(record => (
                      <li key={record.id} className="download-item">
                        <span className="browser-item-icon">
                          <Icon name="download" size={15} />
                        </span>
                        <div className="browser-item-main">
                          <strong title={record.filename}>{record.filename}</strong>
                          <span className="mono browser-item-source">{hostOf(record.url)}</span>
                          <div className="download-meta">
                            <span className={`download-state is-${record.state}`}>
                              {downloadLabel(record, t)}
                            </span>
                            <span className="mono">
                              {record.totalBytes > 0
                                ? `${formatBytes(record.receivedBytes)} / ${formatBytes(record.totalBytes)}`
                                : formatBytes(record.receivedBytes)}
                            </span>
                          </div>
                          {!finished(record) ? (
                            <div
                              className="download-progress"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={downloadProgress(record)}
                            >
                              <span style={{ width: `${downloadProgress(record)}%` }} />
                            </div>
                          ) : null}
                          <div className="download-actions">
                            {!finished(record) ? (
                              <>
                                <button className="link" onClick={() => void pauseDownload(record)}>
                                  {record.state === 'paused' ? t('Resume') : t('Pause')}
                                </button>
                                <button
                                  className="link danger-link"
                                  onClick={() => void cancelDownload(record)}
                                >
                                  {t('Cancel')}
                                </button>
                              </>
                            ) : (
                              <>
                                {record.state === 'completed' ? (
                                  <>
                                    <button className="link" onClick={() => void openDownload(record)}>
                                      {t('Open file')}
                                    </button>
                                    <button className="link" onClick={() => void showDownload(record)}>
                                      {t('Show in folder')}
                                    </button>
                                  </>
                                ) : null}
                                <button
                                  className="link"
                                  onClick={() => void removeDownload(record, false)}
                                >
                                  {t('Remove')}
                                </button>
                                <button
                                  className="link danger-link"
                                  onClick={() => void removeDownload(record, true)}
                                >
                                  {t('Delete file')}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {panel === 'history' ? (
              <div className="browser-panel-body">
                <div className="browser-panel-toolbar">
                  <label className="browser-panel-search">
                    <Icon name="search" size={12} />
                    <input
                      value={historyQuery}
                      onChange={event => setHistoryQuery(event.target.value)}
                      placeholder={t('Search history')}
                      aria-label={t('Search history')}
                    />
                  </label>
                  <button
                    className="link danger-link"
                    disabled={state.history.length === 0}
                    onClick={onClearHistory}
                  >
                    {t('Clear all')}
                  </button>
                </div>
                {visibleHistory.length === 0 ? (
                  <div className="browser-panel-empty">
                    <Icon name="history" size={26} />
                    <strong>
                      {state.history.length === 0 ? t('No history yet') : t('No matches')}
                    </strong>
                    <p>
                      {state.history.length === 0
                        ? t('Pages you visit in a Kryvex tab are recorded here.')
                        : t('Try a different search term.')}
                    </p>
                  </div>
                ) : (
                  <ul className="browser-list">
                    {visibleHistory.map(entry => (
                      <li key={entry.id} className="browser-item">
                        <span className="browser-item-icon">
                          <Icon name="history" size={14} />
                        </span>
                        <div className="browser-item-main">
                          <button
                            className="browser-item-link"
                            onClick={() => openHistory(entry)}
                            title={entry.url}
                          >
                            <strong>{entry.title}</strong>
                            <span className="mono browser-item-source">{hostOf(entry.url)}</span>
                          </button>
                          <div className="browser-item-foot">
                            <span className="mono">{formatDate(entry.visitedAt, locale)}</span>
                            <button
                              className="icon-btn tiny danger"
                              onClick={() => onRemoveHistory(entry.id)}
                              aria-label={t('Remove {name} from history', { name: entry.title })}
                            >
                              <Icon name="close" size={10} />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {panel === 'bookmarks' ? (
              <div className="browser-panel-body">
                <div className="browser-panel-toolbar">
                  <span className="mono muted-label">
                    {t('{count} SAVED', { count: state.bookmarks.length })}
                  </span>
                  <button
                    className="link"
                    disabled={!currentUrl || bookmarked}
                    onClick={() => {
                      if (!currentUrl) return;
                      onAddBookmark({
                        id: makeId('b'),
                        url: currentUrl,
                        title: currentTitle || hostOf(currentUrl),
                        createdAt: Date.now(),
                      });
                      onToast(t('Bookmark saved.'), 'success');
                    }}
                  >
                    {t('Bookmark this page')}
                  </button>
                </div>
                {state.bookmarks.length === 0 ? (
                  <div className="browser-panel-empty">
                    <Icon name="bookmark" size={26} />
                    <strong>{t('No bookmarks yet')}</strong>
                    <p>{t('Use the bookmark button in the tab strip or save the current page here.')}</p>
                  </div>
                ) : (
                  <ul className="browser-list">
                    {state.bookmarks.map(bookmark => (
                      <li key={bookmark.id} className="browser-item">
                        <span className="browser-item-icon">
                          <Icon name="bookmark" size={14} />
                        </span>
                        <div className="browser-item-main">
                          <button
                            className="browser-item-link"
                            onClick={() => navigateTo(bookmark.url, bookmark.title)}
                            title={bookmark.url}
                          >
                            <strong>{bookmark.title}</strong>
                            <span className="mono browser-item-source">{hostOf(bookmark.url)}</span>
                          </button>
                          <div className="browser-item-foot">
                            <span className="mono">{formatDate(bookmark.createdAt, locale)}</span>
                            <button
                              className="icon-btn tiny danger"
                              onClick={() => {
                                onRemoveBookmark(bookmark.id);
                                onToast(t('Bookmark removed.'), 'info');
                              }}
                              aria-label={t('Remove bookmark {name}', { name: bookmark.title })}
                            >
                              <Icon name="close" size={10} />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      {torrentRemove ? (
        <Modal
          title={t('Remove {name}?', { name: torrentRemove.name })}
          onClose={() => setTorrentRemove(null)}
          width={460}
          footer={
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setTorrentRemove(null)}>
                {t('Cancel')}
              </button>
              <button
                className="btn secondary"
                onClick={() => void removeTorrent(torrentRemove, false)}
              >
                {t('Remove torrent')}
              </button>
              <button
                className="btn danger"
                onClick={() => void removeTorrent(torrentRemove, true)}
              >
                <Icon name="trash" size={14} />
                {t('Delete data')}
              </button>
            </div>
          }
        >
          <p className="confirm-body">
            {t(
              'The torrent leaves the queue. Downloaded files stay on disk unless you choose Delete data.',
            )}
          </p>
        </Modal>
      ) : null}

      <p className="footnote mono">
        {t('CHROMIUM SESSION PER TAB')} · {downloads.length} {t('DOWNLOADS')} ·{' '}
        {torrents.length} {t('TORRENTS')} · {state.history.length} {t('HISTORY')} ·{' '}
        {state.bookmarks.length} {t('BOOKMARKS')}
      </p>
    </section>
  );
}
