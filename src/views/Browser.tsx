import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Bookmark, BrowserTab, PersistedState } from '../types';
import { makeId } from '../lib/services';
import { hostOf, resolveAddress } from '../lib/url';
import { Icon, ServiceIcon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import { Webview, type WebviewElement, type WebviewStatus } from '../components/Webview';

export function Browser({
  state,
  tabs,
  activeTabId,
  setTabs,
  setActiveTabId,
  initialTab = false,
  isElectron,
  mark = 'kx',
  onAddBookmark,
  onRemoveBookmark,
  onToast,
}: {
  state: PersistedState;
  tabs: BrowserTab[];
  activeTabId: string | null;
  setTabs: Dispatch<SetStateAction<BrowserTab[]>>;
  setActiveTabId: Dispatch<SetStateAction<string | null>>;
  initialTab?: boolean;
  isElectron: boolean;
  mark?: ThemeMarkKind;
  onAddBookmark: (bookmark: Bookmark) => void;
  onRemoveBookmark: (id: string) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const active = tabs.find(tab => tab.id === activeTabId) ?? null;
  const [address, setAddress] = useState(active?.url ?? '');
  const [status, setStatus] = useState<WebviewStatus>({
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: null,
  });
  const [startQuery, setStartQuery] = useState('');
  const controllers = useRef(new Map<string, WebviewElement | null>());
  const openedInitial = useRef(false);

  // Deep link used by capture runs: open one empty tab so the chrome is visible.
  useEffect(() => {
    if (!initialTab || openedInitial.current || tabs.length > 0) return;
    openedInitial.current = true;
    const id = makeId('t');
    setTabs([{ id, url: '', title: 'New tab' }]);
    setActiveTabId(id);
  }, [initialTab, tabs.length, setTabs, setActiveTabId]);

  useEffect(() => {
    setAddress(active?.url ?? '');
    setStatus({ loading: false, canGoBack: false, canGoForward: false, error: null });
  }, [active?.id, active?.url]);

  const bookmarked = useMemo(
    () => (active?.url ? state.bookmarks.some(bookmark => bookmark.url === active.url) : false),
    [active?.url, state.bookmarks],
  );

  if (tabs.length === 0) {
    return (
      <section className="view browser-view">
        <header className="view-head">
          <div>
            <p className="eyebrow mono">BROWSER / EMPTY SESSION</p>
            <h1>Browser</h1>
            <p className="lede">
              A full browser workspace with tabs, history and bookmarks, running on Chromium with
              the same isolated-session rules as every module.
            </p>
          </div>
        </header>
        <div className="browser-start">
          <ThemeMark mark={mark} size={72} variant="tile" />
          <h2>No tabs open</h2>
          <p>Open a tab to start browsing, or jump into a service.</p>
          <button
            className="btn primary"
            onClick={() => {
              const id = makeId('t');
              setTabs([{ id, url: '', title: 'New tab' }]);
              setActiveTabId(id);
            }}
          >
            <Icon name="plus" size={16} />
            New tab
          </button>
        </div>
      </section>
    );
  }

  function updateActive(patch: Partial<BrowserTab>) {
    if (!active) return;
    setTabs(current => current.map(tab => (tab.id === active.id ? { ...tab, ...patch } : tab)));
  }

  function go(raw: string) {
    const url = resolveAddress(raw, state.settings.searchEngine);
    if (!url || url === 'about:blank') return;
    if (!active) return;
    const controller = controllers.current.get(active.id);
    updateActive({ url, title: hostOf(url) });
    if (controller) {
      void controller.loadURL(url).catch(() => {
        onToast('That navigation was blocked.', 'danger');
      });
    }
  }

  function newTab() {
    const id = makeId('t');
    setTabs(current => [...current, { id, url: '', title: 'New tab' }]);
    setActiveTabId(id);
  }

  function closeTab(id: string) {
    const remaining = tabs.filter(tab => tab.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[remaining.length - 1]?.id ?? null);
    }
    controllers.current.delete(id);
  }

  return (
    <section className="view browser-view">
      <div className="tab-strip" role="tablist" aria-label="Browser tabs">
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
              <span className="tab-title">{tab.title || 'New tab'}</span>
            </button>
            <button
              className="tab-close"
              onClick={() => closeTab(tab.id)}
              aria-label={`Close ${tab.title || 'tab'}`}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
        <button className="new-tab-btn" onClick={newTab} aria-label="New tab" title="New tab">
          <Icon name="plus" size={15} />
        </button>

        <div className="tab-spacer" />

        <button
          className={`icon-btn ${bookmarked ? 'is-on' : ''}`}
          disabled={!active?.url}
          onClick={() => {
            if (!active?.url) return;
            if (bookmarked) {
              const existing = state.bookmarks.find(bookmark => bookmark.url === active.url);
              if (existing) {
                onRemoveBookmark(existing.id);
                onToast('Bookmark removed.', 'info');
              }
            } else {
              onAddBookmark({
                id: makeId('b'),
                url: active.url,
                title: active.title || hostOf(active.url),
                createdAt: Date.now(),
              });
              onToast('Bookmark saved.', 'success');
            }
          }}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
          title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
        >
          <Icon name="bookmark" size={15} />
        </button>
      </div>

      <div className="browser-toolbar">
        <button
          className="icon-btn"
          disabled={!status.canGoBack}
          onClick={() => controllers.current.get(active?.id ?? '')?.goBack()}
          aria-label="Back"
        >
          <Icon name="back" size={16} />
        </button>
        <button
          className="icon-btn"
          disabled={!status.canGoForward}
          onClick={() => controllers.current.get(active?.id ?? '')?.goForward()}
          aria-label="Forward"
        >
          <Icon name="forward" size={16} />
        </button>
        <button
          className="icon-btn"
          onClick={() => controllers.current.get(active?.id ?? '')?.reload()}
          aria-label="Reload"
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
            placeholder="Search or enter an address"
            spellCheck={false}
            aria-label="Address bar"
          />
          {address ? (
            <button
              type="button"
              className="icon-btn tiny"
              onClick={() => setAddress('')}
              aria-label="Clear address"
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
            onToast('Opened in your default browser.', 'info');
          }}
          disabled={!active?.url}
          aria-label="Open in system browser"
          title="Open in system browser"
        >
          <Icon name="external" size={15} />
        </button>
      </div>

      {state.bookmarks.length > 0 ? (
        <div className="bookmarks-bar">
          {state.bookmarks.slice(0, 8).map(bookmark => (
            <span key={bookmark.id} className="bookmark-chip">
              <button onClick={() => go(bookmark.url)} title={bookmark.url}>
                <span className="bookmark-dot" aria-hidden="true" />
                {bookmark.title}
              </button>
              <button
                className="bookmark-remove"
                onClick={() => onRemoveBookmark(bookmark.id)}
                aria-label={`Remove bookmark ${bookmark.title}`}
              >
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="browser-canvas">
        {status.loading && !status.error ? <div className="loading-bar" aria-hidden="true" /> : null}

        {active && active.url === '' ? (
          <div className="browser-start">
            <ThemeMark mark={mark} size={64} variant="tile" />
            <h2>Where to?</h2>
            <p>Search the web or open one of your modules without leaving the workspace.</p>
            <form
              className="start-search"
              onSubmit={event => {
                event.preventDefault();
                if (!startQuery.trim()) return;
                go(startQuery);
              }}
            >
              <Icon name="search" size={15} />
              <input
                autoFocus
                value={startQuery}
                onChange={event => setStartQuery(event.target.value)}
                placeholder={`Search with ${state.settings.searchEngine}`}
                aria-label="Search the web"
              />
              <button type="submit" className="btn secondary small">
                Go
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
                  <button key={bookmark.id} className="start-link" onClick={() => go(bookmark.url)}>
                    <Icon name="bookmark" size={16} />
                    <span>{bookmark.title}</span>
                    <span className="mono">{hostOf(bookmark.url)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!isElectron && active?.url ? (
          <div className="webview-fallback compact">
            <Icon name="globe" size={28} />
            <h2>Browser engine loads in the desktop shell</h2>
            <p>
              Chromium webviews are available in the Electron app. This preview shows the browser
              chrome only.
            </p>
            <a className="btn secondary" href={active.url} target="_blank" rel="noreferrer">
              Open {hostOf(active.url)}
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
                    src={tab.url}
                    partition={`persist:browser-${tab.id}`}
                    controller={{
                      get current() {
                        return controllers.current.get(tab.id) ?? null;
                      },
                      set current(value) {
                        controllers.current.set(tab.id, value);
                      },
                    }}
                    onStatus={value => {
                      if (tab.id === activeTabId) setStatus(value);
                    }}
                    onNavigate={url => {
                      setTabs(current =>
                        current.map(item =>
                          item.id === tab.id
                            ? { ...item, url, title: item.title === 'New tab' ? hostOf(url) : item.title }
                            : item,
                        ),
                      );
                      if (tab.id === activeTabId) setAddress(url);
                    }}
                    onTitle={title => {
                      setTabs(current =>
                        current.map(item => (item.id === tab.id ? { ...item, title } : item)),
                      );
                    }}
                  />
                </div>
              ))
          : null}

        {active?.url && status.error ? (
          <div className="webview-error" role="alert">
            <Icon name="shield" size={22} />
            <h3>This page did not load</h3>
            <p>{status.error}</p>
            <div className="error-actions">
              <button
                className="btn primary"
                onClick={() => controllers.current.get(active.id)?.reload()}
              >
                Try again
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  void window.kryvex?.openExternal(active.url);
                }}
              >
                Open externally
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <p className="footnote mono">
        CHROMIUM SESSION PER TAB · NO NODE IN PAGE CONTENT · {state.bookmarks.length} BOOKMARKS
      </p>
    </section>
  );
}
