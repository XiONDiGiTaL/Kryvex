import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppInfo,
  Bookmark,
  BrowserTab,
  HistoryEntry,
  PermissionPrompt,
  PersistedState,
  Service,
  Settings as SettingsModel,
  Toast,
  ToastTone,
  ViewId,
} from './types';
import { applyBaseTokens, applyTheme, getTheme, isThemeId } from './lib/themes';
import {
  addBookmark as addBookmarkToState,
  addHistory as addHistoryToState,
  addService as addServiceToState,
  clearHistory as clearHistoryFromState,
  markOpened,
  newState,
  removeBookmark as removeBookmarkFromState,
  removeHistory as removeHistoryFromState,
  removeService,
  togglePin,
  updateService as updateServiceInState,
  updateSettings,
} from './lib/store';
import { loadState, saveState, saveStateNow } from './lib/storage';
import { I18nProvider, makeI18n, resolveLanguage } from './lib/i18n';
import { makeId } from './lib/services';
import { hostOf } from './lib/url';
import { Header, Sidebar, StatusBar } from './components/shell';
import { ServiceDialog } from './components/ServiceDialog';
import { HelpDialog } from './components/HelpDialog';
import { CommandPalette } from './components/CommandPalette';
import { EmptyState, Icon, Modal, ToastHost } from './components/ui';
import { Home } from './views/Home';
import { Services } from './views/Services';
import { ServiceView } from './views/ServiceView';
import { Browser, type BrowserPanel } from './views/Browser';
import { Settings } from './views/Settings';

interface Route {
  view: ViewId;
  serviceId?: string;
  query: URLSearchParams;
  key: string;
}

function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', queryString = ''] = raw.split('?');
  const segments = path.split('/').filter(Boolean);
  const query = new URLSearchParams(queryString);
  const head = segments[0];
  if (head === 'service' && segments[1]) {
    return { view: 'services', serviceId: segments[1], query, key: raw };
  }
  const view: ViewId =
    head === 'services' || head === 'browser' || head === 'settings' ? head : 'home';
  return { view, query, key: raw };
}

interface ConfirmRequest {
  title: string;
  body: string;
  label: string;
  onConfirm: () => void;
}

let toastSeq = 0;

export default function App() {
  const [state, setState] = useState<PersistedState>(() => newState());
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; service: Service } | null>(
    null,
  );
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [permissionQueue, setPermissionQueue] = useState<PermissionPrompt[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const persisted = useRef(false);

  const isElectron = typeof window !== 'undefined' && Boolean(window.kryvex);
  const i18n = useMemo(
    () => makeI18n(resolveLanguage(state.settings.language)),
    [state.settings.language],
  );
  const t = i18n.t;

  const pushToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `t-${++toastSeq}`;
    setToasts(current => [...current.slice(-2), { id, message, tone }]);
    setTimeout(() => {
      setToasts(current => current.filter(toast => toast.id !== id));
    }, 3200);
  }, []);

  const navigate = useCallback((next: string) => {
    const target = next.startsWith('#') ? next : `#/${next}`;
    if (window.location.hash === target) {
      setRoute(parseHash(target));
    } else {
      window.location.hash = target;
    }
  }, []);

  const openExternalTab = useCallback(
    (url: string) => {
      const id = makeId('t');
      setTabs(current => [...current, { id, url, title: hostOf(url) }]);
      setActiveTabId(id);
      navigate('browser');
    },
    [navigate],
  );

  // Windows passes http(s) links to the registered browser through argv.
  // Pull URLs queued before the renderer mounted, then listen for later ones.
  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    const receive = (url: string) => {
      if (alive) openExternalTab(url);
    };
    void window.kryvex
      .takeBrowserUrls()
      .then(urls => urls.forEach(receive))
      .catch(() => undefined);
    const stop = window.kryvex.onOpenUrl(receive);
    return () => {
      alive = false;
      stop();
    };
  }, [isElectron, openExternalTab]);

  // Magnet links intercepted by the main process are opened in the Downloads
  // hub. Torrents are an internet tool, not a browsable catalogue.
  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    const stopMagnet = window.kryvex.onOpenMagnet(magnet => {
      void window.kryvex
        ?.torrentsAddMagnet(magnet)
        .then(result => {
          if (!alive) return;
          pushToast(t(result.message), result.ok ? 'success' : 'danger');
          if (result.ok) navigate('browser?panel=downloads');
        })
        .catch(() => {
          if (alive) pushToast(t('The torrent could not be added.'), 'danger');
        });
    });
    const stopNotice = window.kryvex.onTorrentsNotice(notice => {
      if (alive) pushToast(t(notice.message), notice.tone);
    });
    return () => {
      alive = false;
      stopMagnet();
      stopNotice();
    };
  }, [isElectron, navigate, pushToast, t]);

  // Camera and microphone prompts live in the trusted shell, never in the
  // page that requested them. The page only receives the allow/deny result.
  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    return window.kryvex.onPermissionRequest(request => {
      setPermissionQueue(current =>
        current.some(item => item.id === request.id) ? current : [...current, request],
      );
    });
  }, [isElectron]);

  const permissionRequest = permissionQueue[0] ?? null;
  const permissionDevices = permissionRequest
    ? permissionRequest.devices
        .map(device => (device === 'microphone' ? t('Microphone') : t('Camera')))
        .join(' + ')
    : '';

  const answerPermission = useCallback(
    (allow: boolean) => {
      const request = permissionQueue[0];
      if (!request) return;
      setPermissionQueue(current => current.filter(item => item.id !== request.id));
      void window.kryvex?.respondPermission(request.id, allow).catch(() => undefined);
    },
    [permissionQueue],
  );

  // Boot: tokens, persisted state, route from the preferred start view.
  useEffect(() => {
    applyBaseTokens();
    void (async () => {
      const loaded = await loadState();
      setState(loaded);
      // A URL handed to the app by Windows is queued before the renderer
      // boots. Keep those new tabs and merge the saved session behind them.
      setTabs(current => {
        const alreadyOpen = new Set(current.map(tab => tab.id));
        const restored = loaded.browser.tabs.filter(tab => !alreadyOpen.has(tab.id));
        return current.length > 0 ? [...current, ...restored] : loaded.browser.tabs;
      });
      setActiveTabId(current => current ?? loaded.browser.activeTabId);
      setReady(true);
      if (!window.location.hash || window.location.hash === '#') {
        window.location.hash = `#/${loaded.settings.startView}`;
      }
      if (window.kryvex) {
        try {
          setInfo(await window.kryvex.appInfo());
        } catch {
          /* info is decorative; ignore */
        }
      }
    })();
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Theme override is used by capture runs and shareable deep links.
  const themeOverride = route.query.get('theme');
  const themeId =
    themeOverride && isThemeId(themeOverride) ? themeOverride : state.settings.themeId;
  const themeMark = getTheme(themeId).mark ?? 'kx';

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    document.documentElement.dataset.density = state.settings.density;
  }, [state.settings.density]);

  useEffect(() => {
    if (!ready) return;
    if (persisted.current) {
      saveState(state);
    } else {
      persisted.current = true;
    }
  }, [state, ready]);

  // Browser tabs live in App so they survive route changes. Keep the saved
  // session in the same atomic state file as services, history and settings.
  useEffect(() => {
    if (!ready) return;
    setState(current => {
      const nextTabs = tabs.map(({ id, url, title }) => ({ id, url, title }));
      const nextActiveId = nextTabs.some(tab => tab.id === activeTabId)
        ? activeTabId
        : (nextTabs[0]?.id ?? null);
      const sameTabs =
        current.browser.tabs.length === nextTabs.length &&
        current.browser.tabs.every(
          (tab, index) =>
            tab.id === nextTabs[index]?.id &&
            tab.url === nextTabs[index]?.url &&
            tab.title === nextTabs[index]?.title,
        );
      if (sameTabs && current.browser.activeTabId === nextActiveId) return current;
      return { ...current, browser: { tabs: nextTabs, activeTabId: nextActiveId } };
    });
  }, [activeTabId, ready, tabs]);

  useEffect(() => {
    const flush = () => void saveStateNow(state);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [state]);

  // A route change dismisses transient UI; deep links can then re-open it.
  useEffect(() => {
    setDialog(null);
    setPaletteOpen(false);
    setHelpOpen(false);
    document.querySelector('.app-main')?.scrollTo(0, 0);
    if (!ready) return;
    if (route.query.get('palette') === '1') setPaletteOpen(true);
    if (route.query.get('help') === '1') setHelpOpen(true);
    if (route.query.get('dialog') === 'new') setDialog({ mode: 'new' });
  }, [ready, route.key]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(open => !open);
      }
      if (event.key === 'Escape') {
        setConfirmRequest(null);
      }
      if (mod && ['1', '2', '3', '4'].includes(event.key)) {
        const views: ViewId[] = ['home', 'services', 'browser', 'settings'];
        const target = views[Number(event.key) - 1];
        if (target) {
          event.preventDefault();
          navigate(target);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const openService = useCallback(
    (service: Service) => {
      setState(current => markOpened(current, service.id));
      navigate(`#/service/${service.id}`);
    },
    [navigate],
  );

  const saveService = useCallback(
    (service: Service) => {
      const editing = Boolean(dialog && dialog.mode === 'edit');
      setState(current =>
        editing ? updateServiceInState(current, service) : addServiceToState(current, service),
      );
      setDialog(null);
      pushToast(
        editing
          ? t('{name} updated.', { name: service.name })
          : t('{name} added.', { name: service.name }),
        'success',
      );
    },
    [dialog, pushToast, t],
  );

  const deleteService = useCallback(
    (service: Service) => {
      const remove = () => {
        setState(current => removeService(current, service.id));
        setConfirmRequest(null);
        if (route.serviceId === service.id) navigate('services');
        pushToast(t('{name} removed.', { name: service.name }), 'warning');
      };
      if (!state.settings.confirmBeforeDelete) {
        remove();
        return;
      }
      setConfirmRequest({
        title: t('Remove {name}?', { name: service.name }),
        body: t(
          'The module and its place in recents are removed. The site itself is untouched; its session data stays on disk.',
        ),
        label: t('Remove module'),
        onConfirm: remove,
      });
    },
    [navigate, pushToast, route.serviceId, state.settings.confirmBeforeDelete, t],
  );

  const updateSettingsPatch = useCallback((patch: Partial<SettingsModel>) => {
    setState(current => updateSettings(current, patch));
  }, []);

  const resetWorkspace = useCallback(() => {
    setConfirmRequest({
      title: t('Reset the workspace?'),
      body: t(
        'Services, bookmarks, history and preferences are replaced with the starter set. This cannot be undone.',
      ),
      label: t('Reset everything'),
      onConfirm: () => {
        setState(newState());
        setTabs([]);
        setActiveTabId(null);
        setConfirmRequest(null);
        navigate('home');
        pushToast(t('Workspace reset to starters.'), 'warning');
      },
    });
  }, [navigate, pushToast, t]);

  const addBookmark = useCallback(
    (bookmark: Bookmark) => {
      setState(current => addBookmarkToState(current, bookmark));
    },
    [],
  );

  const removeBookmark = useCallback((id: string) => {
    setState(current => removeBookmarkFromState(current, id));
  }, []);

  const addHistoryEntry = useCallback((entry: HistoryEntry) => {
    setState(current => addHistoryToState(current, entry));
  }, []);

  const removeHistoryEntry = useCallback((id: string) => {
    setState(current => removeHistoryFromState(current, id));
  }, []);

  const clearAllHistory = useCallback(() => {
    setConfirmRequest({
      title: t('Clear browsing history?'),
      body: t(
        'Every visited page is removed from Kryvex history. Bookmarks and downloads are kept.',
      ),
      label: t('Clear history'),
      onConfirm: () => {
        setState(current => clearHistoryFromState(current));
        setConfirmRequest(null);
        pushToast(t('Browsing history cleared.'), 'warning');
      },
    });
  }, [pushToast, t]);

  const activeService = route.serviceId
    ? state.services.find(service => service.id === route.serviceId)
    : undefined;

  const requestedPanel = route.query.get('panel');
  const initialBrowserPanel: BrowserPanel | null =
    requestedPanel === 'downloads' || requestedPanel === 'history' || requestedPanel === 'bookmarks'
      ? requestedPanel
      : null;

  const title = useMemo(() => {
    if (route.serviceId) return activeService?.name ?? t('Missing module');
    switch (route.view) {
      case 'services':
        return t('Services');
      case 'browser':
        return t('Browser');
      case 'settings':
        return t('Settings');
      default:
        return t('Home');
    }
  }, [activeService?.name, route.serviceId, route.view, t]);

  return (
    <I18nProvider value={i18n}>
    <div className={`app ${isElectron ? 'is-electron' : 'is-web'} ${state.settings.showStatusBar ? '' : 'no-status'}`}>
      <Header
        title={title}
        view={route.view}
        onPalette={() => setPaletteOpen(true)}
        onAdd={() => setDialog({ mode: 'new' })}
        onSettings={() => navigate('settings')}
        onHelp={() => setHelpOpen(true)}
        isElectron={isElectron}
        mark={themeMark}
      />

      <Sidebar
        state={state}
        routeView={route.view}
        collapsed={state.settings.sidebarCollapsed}
        onToggle={() => updateSettingsPatch({ sidebarCollapsed: !state.settings.sidebarCollapsed })}
        onNavigate={view => navigate(view)}
        onOpenService={openService}
        onAdd={() => setDialog({ mode: 'new' })}
      />

      <main className="app-main">
        {route.serviceId ? (
          activeService ? (
            <ServiceView
              key={activeService.id}
              service={activeService}
              isElectron={isElectron}
              onBack={() => navigate('services')}
              onEdit={service => setDialog({ mode: 'edit', service })}
              onDelete={deleteService}
              onToast={pushToast}
              mark={themeMark}
            />
          ) : (
            <div className="view">
              <EmptyState
                title={t('That module is gone')}
                body={t(
                  'It was removed, or the link points at an identifier that no longer exists.',
                )}
                mark={themeMark}
                action={
                  <button className="btn primary" onClick={() => navigate('services')}>
                    {t('Back to services')}
                  </button>
                }
              />
            </div>
          )
        ) : route.view === 'home' ? (
          <Home
            state={state}
            themeId={themeId}
            info={info}
            isElectron={isElectron}
            mark={themeMark}
            onOpenService={openService}
            onAdd={() => setDialog({ mode: 'new' })}
            onNavigate={view => navigate(view)}
          />
        ) : route.view === 'services' ? (
          <Services
            state={state}
            onOpen={openService}
            onEdit={service => setDialog({ mode: 'edit', service })}
            onAdd={() => setDialog({ mode: 'new' })}
            onTogglePin={service => {
              setState(current => togglePin(current, service.id));
              pushToast(
                service.pinned
                  ? t('{name} unpinned.', { name: service.name })
                  : t('{name} pinned.', { name: service.name }),
                'info',
              );
            }}
            onDelete={deleteService}
          />
        ) : route.view === 'browser' ? (
          <Browser
            key={route.key}
            state={state}
            tabs={tabs}
            activeTabId={activeTabId}
            setTabs={setTabs}
            setActiveTabId={setActiveTabId}
            initialTab={route.query.get('newtab') === '1'}
            initialUrl={route.query.get('url')}
            initialPanel={initialBrowserPanel}
            isElectron={isElectron}
            mark={themeMark}
            onAddBookmark={addBookmark}
            onRemoveBookmark={removeBookmark}
            onAddHistory={addHistoryEntry}
            onRemoveHistory={removeHistoryEntry}
            onClearHistory={clearAllHistory}
            onToast={pushToast}
          />
        ) : (
          <Settings
            state={state}
            info={info}
            isElectron={isElectron}
            mark={themeMark}
            onUpdate={updateSettingsPatch}
            onReset={resetWorkspace}
            onToast={pushToast}
          />
        )}
      </main>

      {state.settings.showStatusBar ? (
        <StatusBar
          state={state}
          themeId={themeId}
          appInfo={info}
          isElectron={isElectron}
          mark={themeMark}
        />
      ) : null}

      {paletteOpen ? (
        <CommandPalette
          state={state}
          onClose={() => setPaletteOpen(false)}
          onNavigate={view => navigate(view)}
          onOpenService={openService}
          onAdd={() => setDialog({ mode: 'new' })}
          onSetTheme={id => {
            updateSettingsPatch({ themeId: id });
            pushToast(t('Theme updated.'), 'success');
          }}
        />
      ) : null}

      {helpOpen ? (
        <HelpDialog
          onClose={() => setHelpOpen(false)}
          onAdd={() => setDialog({ mode: 'new' })}
          onNavigate={view => navigate(view)}
        />
      ) : null}

      {dialog ? (
        <ServiceDialog
          initial={dialog.mode === 'edit' ? dialog.service : undefined}
          onSave={saveService}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {permissionRequest ? (
        <Modal
          title={t('{host} wants to use {devices}', {
            host: permissionRequest.host,
            devices: permissionDevices,
          })}
          subtitle={t('Media permission')}
          onClose={() => answerPermission(false)}
          width={460}
          footer={
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => answerPermission(false)}>
                {t('Block')}
              </button>
              <button className="btn primary" onClick={() => answerPermission(true)}>
                <Icon name="check" size={14} />
                {t('Allow')}
              </button>
            </div>
          }
        >
          <div className="permission-request">
            <span className="permission-request-mark">
              <Icon name="shield" size={22} />
            </span>
            <p>
              {t(
                'Allow {devices} for this site? Only continue if you trust it. This choice lasts until Kryvex restarts.',
                { devices: permissionDevices },
              )}
            </p>
            <span className="mono permission-origin">{permissionRequest.origin}</span>
          </div>
        </Modal>
      ) : null}

      {confirmRequest ? (
        <Modal
          title={confirmRequest.title}
          onClose={() => setConfirmRequest(null)}
          width={440}
          footer={
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmRequest(null)}>
                {t('Cancel')}
              </button>
              <button className="btn danger" onClick={confirmRequest.onConfirm}>
                <Icon name="trash" size={14} />
                {confirmRequest.label}
              </button>
            </div>
          }
        >
          <p className="confirm-body">{confirmRequest.body}</p>
        </Modal>
      ) : null}

      <ToastHost toasts={toasts} />
    </div>
    </I18nProvider>
  );
}
