import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppInfo,
  Bookmark,
  BrowserTab,
  PersistedState,
  Service,
  Settings as SettingsModel,
  Toast,
  ToastTone,
  ViewId,
} from './types';
import { applyBaseTokens, applyTheme, isThemeId } from './lib/themes';
import {
  addBookmark as addBookmarkToState,
  addService as addServiceToState,
  markOpened,
  newState,
  removeBookmark as removeBookmarkFromState,
  removeService,
  togglePin,
  updateService as updateServiceInState,
  updateSettings,
} from './lib/store';
import { loadState, saveState, saveStateNow } from './lib/storage';
import { Header, Sidebar, StatusBar } from './components/shell';
import { ServiceDialog } from './components/ServiceDialog';
import { CommandPalette } from './components/CommandPalette';
import { EmptyState, Icon, Modal, ToastHost } from './components/ui';
import { Home } from './views/Home';
import { Services } from './views/Services';
import { ServiceView } from './views/ServiceView';
import { Browser } from './views/Browser';
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
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; service: Service } | null>(
    null,
  );
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const persisted = useRef(false);

  const isElectron = typeof window !== 'undefined' && Boolean(window.kryvex);

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

  // Boot: tokens, persisted state, route from the preferred start view.
  useEffect(() => {
    applyBaseTokens();
    void (async () => {
      const loaded = await loadState();
      setState(loaded);
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

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

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

  useEffect(() => {
    const flush = () => void saveStateNow(state);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [state]);

  // A route change dismisses transient UI; deep links can then re-open it.
  useEffect(() => {
    setDialog(null);
    setPaletteOpen(false);
    document.querySelector('.app-main')?.scrollTo(0, 0);
    if (!ready) return;
    if (route.query.get('palette') === '1') setPaletteOpen(true);
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
      pushToast(editing ? `${service.name} updated.` : `${service.name} added.`, 'success');
    },
    [dialog, pushToast],
  );

  const deleteService = useCallback(
    (service: Service) => {
      const remove = () => {
        setState(current => removeService(current, service.id));
        setConfirmRequest(null);
        if (route.serviceId === service.id) navigate('services');
        pushToast(`${service.name} removed.`, 'warning');
      };
      if (!state.settings.confirmBeforeDelete) {
        remove();
        return;
      }
      setConfirmRequest({
        title: `Remove ${service.name}?`,
        body: 'The module and its place in recents are removed. The site itself is untouched; its session data stays on disk.',
        label: 'Remove module',
        onConfirm: remove,
      });
    },
    [navigate, pushToast, route.serviceId, state.settings.confirmBeforeDelete],
  );

  const updateSettingsPatch = useCallback((patch: Partial<SettingsModel>) => {
    setState(current => updateSettings(current, patch));
  }, []);

  const resetWorkspace = useCallback(() => {
    setConfirmRequest({
      title: 'Reset the workspace?',
      body: 'Services, bookmarks and preferences are replaced with the starter set. This cannot be undone.',
      label: 'Reset everything',
      onConfirm: () => {
        setState(newState());
        setConfirmRequest(null);
        navigate('home');
        pushToast('Workspace reset to starters.', 'warning');
      },
    });
  }, [navigate, pushToast]);

  const addBookmark = useCallback(
    (bookmark: Bookmark) => {
      setState(current => addBookmarkToState(current, bookmark));
    },
    [],
  );

  const removeBookmark = useCallback((id: string) => {
    setState(current => removeBookmarkFromState(current, id));
  }, []);

  const activeService = route.serviceId
    ? state.services.find(service => service.id === route.serviceId)
    : undefined;

  const title = useMemo(() => {
    if (route.serviceId) return activeService?.name ?? 'Missing module';
    switch (route.view) {
      case 'services':
        return 'Services';
      case 'browser':
        return 'Browser';
      case 'settings':
        return 'Settings';
      default:
        return 'Home';
    }
  }, [activeService?.name, route.serviceId, route.view]);

  return (
    <div className={`app ${isElectron ? 'is-electron' : 'is-web'} ${state.settings.showStatusBar ? '' : 'no-status'}`}>
      <Header title={title} onPalette={() => setPaletteOpen(true)} isElectron={isElectron} />

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
            />
          ) : (
            <div className="view">
              <EmptyState
                title="That module is gone"
                body="It was removed, or the link points at an identifier that no longer exists."
                action={
                  <button className="btn primary" onClick={() => navigate('services')}>
                    Back to services
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
              pushToast(service.pinned ? `${service.name} unpinned.` : `${service.name} pinned.`, 'info');
            }}
            onDelete={deleteService}
          />
        ) : route.view === 'browser' ? (
          <Browser
            state={state}
            tabs={tabs}
            activeTabId={activeTabId}
            setTabs={setTabs}
            setActiveTabId={setActiveTabId}
            initialTab={route.query.get('newtab') === '1'}
            isElectron={isElectron}
            onAddBookmark={addBookmark}
            onRemoveBookmark={removeBookmark}
            onToast={pushToast}
          />
        ) : (
          <Settings
            state={state}
            info={info}
            isElectron={isElectron}
            onUpdate={updateSettingsPatch}
            onReset={resetWorkspace}
            onToast={pushToast}
          />
        )}
      </main>

      {state.settings.showStatusBar ? (
        <StatusBar state={state} themeId={themeId} appInfo={info} isElectron={isElectron} />
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
            pushToast('Theme updated.', 'success');
          }}
        />
      ) : null}

      {dialog ? (
        <ServiceDialog
          initial={dialog.mode === 'edit' ? dialog.service : undefined}
          onSave={saveService}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {confirmRequest ? (
        <Modal
          title={confirmRequest.title}
          onClose={() => setConfirmRequest(null)}
          width={440}
          footer={
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmRequest(null)}>
                Cancel
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
  );
}
