import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  AppInfo,
  Bookmark,
  BrowserTab,
  HistoryEntry,
  PermissionPrompt,
  PersistedState,
  RssFeed,
  SecretToolId,
  Service,
  Settings as SettingsModel,
  Toast,
  ToastTone,
  UpdateStatus,
  ViewId,
  WallpaperImage,
} from './types';
import { applyBaseTokens, applyTheme, getTheme, isThemeId } from './lib/themes';
import { applyTypography } from './lib/typography';
import {
  addBookmark as addBookmarkToState,
  addFeeds as addFeedsToState,
  addHistory as addHistoryToState,
  addService as addServiceToState,
  clearHistory as clearHistoryFromState,
  markOpened,
  moveService,
  newState,
  removeBookmark as removeBookmarkFromState,
  removeFeed as removeFeedFromState,
  removeHistory as removeHistoryFromState,
  removeService,
  togglePin,
  toggleToolPin,
  updateService as updateServiceInState,
  updateSettings,
} from './lib/store';
import { loadState, saveState, saveStateNow } from './lib/storage';
import { shouldAutoStartCore } from './lib/vexium-core';
import { clearWallpaper, importWallpaper, loadWallpaper } from './lib/wallpaper';
import { I18nProvider, makeI18n, resolveLanguage } from './lib/i18n';
import { makeId, partitionFor } from './lib/services';
import { addScreenCapture } from './lib/screen-capture';
import { SECRET_TOOL_LABELS } from './lib/secret-tools';
import { totalUnread, unreadFromTitle, windowTitle } from './lib/unread';
import { hostOf, resolveAddress } from './lib/url';
import { Header, Sidebar, StatusBar } from './components/shell';
import { ServiceDialog } from './components/ServiceDialog';
import { HelpDialog } from './components/HelpDialog';
import { CommandPalette } from './components/CommandPalette';
import { EmptyState, Icon, Modal, ToastHost } from './components/ui';
import { ThemeGallery } from './components/ThemeGallery';
import { Home } from './views/Home';
import { Services } from './views/Services';
import { Emulator } from './views/Emulator';
import { Lexium } from './views/Lexium';
import { Player } from './views/Player';
import { DiskPulse } from './views/DiskPulse';
import { PlayerProvider } from './components/PlayerProvider';
import { KeepAlive, useLifecycle } from './components/ServiceLifecycle';
import { PlayerBar } from './components/PlayerBar';
import { ResourcePanel } from './components/ResourceMonitor';
import { ServiceContextMenu, type ServiceMenuPoint } from './components/ServiceContextMenu';
import { ServiceMediaDock } from './components/ServiceMediaDock';
import { InstallPrompt } from './components/InstallPrompt';
import { useResourceSnapshot } from './lib/resources';
import { useServiceMedia } from './lib/media';
import { ServiceStage } from './views/ServiceStage';
import { Workspace, type CanvasRect } from './views/Workspace';
import {
  clampWindows,
  closeWindow,
  floatWindow,
  moveWindow,
  openWindow,
  raiseWindow,
  resizeWindow,
  toggleMaximize,
  toggleMinimize,
  type WindowMap,
  type WindowSpace,
} from './lib/workspace';
import type { ResizeDirection } from './lib/floating';
import { Assistant } from './views/Assistant';
import { Link } from './views/Link';
import { Rooms } from './views/Rooms';
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
    head === 'services' ||
    head === 'browser' ||
    head === 'workspace' ||
    head === 'assistant' ||
    head === 'rooms' ||
    head === 'settings' ||
    head === 'emulator' ||
    head === 'lexium' ||
    head === 'player' ||
    head === 'disk' ||
    head === 'link'
      ? head
      : 'home';
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
  const [dialog, setDialog] = useState<
    { mode: 'new'; target?: 'workspace' } | { mode: 'edit'; service: Service } | null
  >(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [permissionQueue, setPermissionQueue] = useState<PermissionPrompt[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Service apps stay mounted for the session; openIds is the live set.
  const [openIds, setOpenIds] = useState<string[]>([]);
  // Windows are session state like openIds: geometry that outlived a restart
  // would put a window somewhere the user never chose.
  const [windows, setWindows] = useState<WindowMap>({});
  const [canvas, setCanvas] = useState<CanvasRect | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [wallpaper, setWallpaper] = useState<WallpaperImage | null>(null);
  const [reloadTokens, setReloadTokens] = useState<Record<string, number>>({});
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [serviceMenu, setServiceMenu] = useState<{
    service: Service;
    point: ServiceMenuPoint;
  } | null>(null);
  const [emulatorPrompt, setEmulatorPrompt] = useState(false);
  // Bumped after an engine change: a <webview> keeps the preferences it
  // attached with, so every guest is remounted to pick up the new ones.
  const [engineRevision, setEngineRevision] = useState(0);
  const unreadRef = useRef<Record<string, number>>({});
  const persisted = useRef(false);
  const autoChecked = useRef(false);
  const announcedUpdate = useRef<string | null>(null);

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
      } else {
        // The PWA has no Electron bridge, but the status bar and Settings still
        // need an honest identity rather than the desktop fallback.
        setInfo({
          version: __APP_VERSION__,
          platform: 'web',
          electron: '',
          chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '',
          node: '',
          packaged: false,
        });
      }
    })();
  }, []);

  // Vexium Core picks a fresh loopback port on every launch, so a profile that
  // selected it holds a stale address until the server reports the new one.
  // Starting it once here is what makes the first visit read RUNTIME ONLINE.
  const coreStarted = useRef(false);
  useEffect(() => {
    if (!ready || coreStarted.current || !isElectron || !window.kryvex) return;
    if (state.settings.assistant.provider !== 'local') return;
    coreStarted.current = true;
    const bridge = window.kryvex;
    void (async () => {
      const status = await bridge.modelStatus().catch(() => null);
      if (!shouldAutoStartCore({ provider: 'local', status })) return;
      const next = await bridge.modelStart().catch(() => null);
      if (!next || next.phase !== 'running' || !next.baseUrl) return;
      setState(current =>
        updateSettings(current, {
          assistant: { ...current.settings.assistant, baseUrl: next.baseUrl, model: '' },
        }),
      );
    })();
  }, [isElectron, ready, state.settings.assistant.provider]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Theme override is used by capture runs and shareable deep links.
  const themeOverride = route.query.get('theme');
  const themeId =
    themeOverride && isThemeId(themeOverride) ? themeOverride : state.settings.themeId;
  const themeMark = getTheme(themeId, state.settings.customTheme).mark ?? 'kx';
  // A shareable/capture link (or a reload after picking) must never be covered
  // by the first-run sheet.
  const firstLook = ready && !state.settings.themeGallerySeen && !themeOverride;

  useEffect(() => {
    applyTheme(themeId, state.settings.customTheme);
  }, [themeId, state.settings.customTheme]);

  // Declared after the theme effect so the user's text choices survive a theme
  // switch: `applyTheme` also writes `--font-sans`.
  useEffect(() => {
    applyTypography(state.settings.typography);
  }, [state.settings.typography, themeId, state.settings.customTheme]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    document.documentElement.dataset.density = state.settings.density;
  }, [state.settings.density]);

  useEffect(() => {
    let alive = true;
    void loadWallpaper().then(next => {
      if (alive && next) setWallpaper(next);
    });
    return () => {
      alive = false;
    };
  }, []);

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
      // Private tabs are deliberately session-only: reopening Kryvex must not
      // restore what an incognito window was looking at.
      const nextTabs = tabs
        .filter(tab => !tab.private)
        .map(({ id, url, title }) => ({ id, url, title }));
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
      if (mod && ['1', '2', '3', '4', '5', '6'].includes(event.key)) {
        const views: ViewId[] = [
          'home',
          'services',
          'browser',
          'assistant',
          'settings',
          'rooms',
        ];
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
      setOpenIds(current =>
        [service.id, ...current.filter(id => id !== service.id)].slice(0, 8),
      );
      navigate(`#/service/${service.id}`);
    },
    [navigate],
  );

  // A deep link or a restored hash must mount the module it points at.
  useEffect(() => {
    if (!route.serviceId) return;
    setOpenIds(current =>
      current.includes(route.serviceId as string)
        ? current
        : [route.serviceId as string, ...current].slice(0, 8),
    );
  }, [route.serviceId]);

  /**
   * The two surfaces a window is measured against. The canvas is only known
   * while the Workspace is mounted; before that (or on another view) the
   * viewport stands in, and the clamp below pulls anything that lands outside
   * back in as soon as the real box arrives.
   */
  const windowSpace = useCallback(
    (): WindowSpace => ({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    }),
    [canvas],
  );
  const spaceRef = useRef(windowSpace);
  useEffect(() => {
    spaceRef.current = windowSpace;
  }, [windowSpace]);

  /** Opens a service as a window on the Workspace surface. */
  const openInWorkspace = useCallback(
    (service: Service, at?: { x: number; y: number }) => {
      setState(current => markOpened(current, service.id));
      setOpenIds(current =>
        [service.id, ...current.filter(id => id !== service.id)].slice(0, 8),
      );
      setWindows(current => openWindow(current, service.id, 'canvas', windowSpace(), at));
      navigate('workspace');
    },
    [navigate, windowSpace],
  );

  // A closed module cannot leave a window behind; the record goes with it.
  useEffect(() => {
    setWindows(current => {
      const stale = Object.keys(current).filter(id => !openIds.includes(id));
      if (stale.length === 0) return current;
      return stale.reduce((next, id) => closeWindow(next, id), current);
    });
  }, [openIds]);

  // Every surface change re-fits the windows that live on it.
  useEffect(() => {
    setWindows(current => clampWindows(current, windowSpace()));
  }, [windowSpace]);

  useEffect(() => {
    const reflow = () => setWindows(current => clampWindows(current, spaceRef.current()));
    window.addEventListener('resize', reflow);
    return () => window.removeEventListener('resize', reflow);
  }, []);

  /** Detaches the open module into a window over the rest of the app. */
  const floatService = useCallback(
    (id: string) => {
      setWindows(current => floatWindow(current, id, windowSpace()));
      navigate('services');
    },
    [navigate, windowSpace],
  );

  const dockService = useCallback(
    (id: string) => {
      setWindows(current => closeWindow(current, id));
      navigate(`#/service/${id}`);
    },
    [navigate],
  );

  /**
   * Closing a window ends the guest: the module leaves the live set, the stage
   * unmounts the frame and the main process stops the remaining guests for the
   * partition. Cookies stay on disk, so reopening is a visit, not a sign-in.
   */
  const closeServiceWindow = useCallback((id: string) => {
    setWindows(current => closeWindow(current, id));
    setOpenIds(current => current.filter(openId => openId !== id));
    // Unmounting the frame ends the guest normally; the main process also ends
    // any guest that outlived its renderer, the same way a forced stop does.
    void window.kryvex?.serviceStop(partitionFor(id)).catch(() => 0);
  }, []);

  const moveServiceWindow = useCallback((id: string, dx: number, dy: number) => {
    setWindows(current => moveWindow(current, id, dx, dy, spaceRef.current()));
  }, []);

  const resizeServiceWindow = useCallback(
    (id: string, direction: ResizeDirection, dx: number, dy: number) => {
      setWindows(current => resizeWindow(current, id, direction, dx, dy, spaceRef.current()));
    },
    [],
  );

  const raiseServiceWindow = useCallback((id: string) => {
    setWindows(current => raiseWindow(current, id));
  }, []);

  const minimizeServiceWindow = useCallback((id: string) => {
    setWindows(current => toggleMinimize(current, id));
  }, []);

  const maximizeServiceWindow = useCallback((id: string) => {
    setWindows(current => toggleMaximize(current, id, spaceRef.current()));
  }, []);

  const handleServiceTitle = useCallback((service: Service, title: string) => {
    // "Notifications off" also means no unread badge or taskbar nudge from
    // this module; the site's own title still updates inside its frame.
    if (service.notifications === false) return;
    const count = unreadFromTitle(title);
    const previous = unreadRef.current[service.id] ?? 0;
    if (previous === count) return;
    const next = { ...unreadRef.current, [service.id]: count };
    unreadRef.current = next;
    setUnread(next);
    // A new message while Kryvex is in the background asks for attention in
    // the taskbar; focusing the window clears it in the main process.
    if (count > previous && !document.hasFocus()) window.kryvex?.attention(true);
  }, []);

  const clearServiceSession = useCallback(
    (service: Service) => {
      setConfirmRequest({
        title: t('Clear the session for {name}?', { name: service.name }),
        body: t(
          'Cookies, local storage and cache for this service are deleted; no other module is touched. You will need to sign in again.',
        ),
        label: t('Clear session'),
        onConfirm: () => {
          setConfirmRequest(null);
          void (async () => {
            const ok = await window.kryvex
              ?.serviceClearSession(partitionFor(service.id))
              .catch(() => false);
            if (ok) {
              setReloadTokens(current => ({
                ...current,
                [service.id]: (current[service.id] ?? 0) + 1,
              }));
            }
            pushToast(
              ok
                ? t('{name} session cleared. Sign in again when you reopen it.', { name: service.name })
                : t('The session could not be cleared.'),
              ok ? 'warning' : 'danger',
            );
          })();
        },
      });
    },
    [pushToast, t],
  );

  const saveService = useCallback(
    (service: Service) => {
      const editing = Boolean(dialog && dialog.mode === 'edit');
      // Added from the Workspace, the new module belongs on the canvas rather
      // than opening focused: the dialog was opened to fill that surface.
      const intoWorkspace = Boolean(
        dialog && dialog.mode === 'new' && dialog.target === 'workspace',
      );
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
      if (intoWorkspace) openInWorkspace(service);
    },
    [dialog, openInWorkspace, pushToast, t],
  );

  const deleteService = useCallback(
    (service: Service) => {
      const remove = () => {
        setState(current => removeService(current, service.id));
        setOpenIds(current => current.filter(id => id !== service.id));
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

  /**
   * The capture button in the header is the snipping tool from anywhere.
   *
   * A fresh profile keeps the capture widget off the board — it is one of the
   * opt-in cards — so the button reveals it first, then goes Home and bumps a
   * pulse. The widget answers the pulse by scrolling itself into view and
   * focusing its target picker, which is the whole capture flow: choose what to
   * capture, take the still or start the recording.
   */
  const [capturePulse, setCapturePulse] = useState(0);
  const openCapture = useCallback(() => {
    setState(current =>
      current.settings.home.showCapture
        ? current
        : updateSettings(current, {
            home: { ...current.settings.home, showCapture: true, showBoard: true },
          }),
    );
    navigate('home');
    setCapturePulse(value => value + 1);
  }, [navigate]);

  const updateServiceFlags = useCallback((service: Service, patch: Partial<Service>) => {
    const next = { ...service, ...patch };
    setState(current => ({
      ...current,
      services: current.services.map(item =>
        item.id === service.id ? { ...item, ...patch } : item,
      ),
    }));
    if (patch.notifications === false) {
      const cleared = { ...unreadRef.current, [service.id]: 0 };
      unreadRef.current = cleared;
      setUnread(cleared);
    }
    void window.kryvex
      ?.serviceSetPolicy(partitionFor(service.id), {
        notifications: next.notifications !== false,
        muted: Boolean(next.muted),
      })
      .catch(() => undefined);
  }, []);

  /**
   * Kryvex's own tools sit beside services on the rail, so both entry points
   * open them the same way: the emulator asks for its disclaimer first.
   */
  const openSecretTool = useCallback(
    (tool: SecretToolId) => {
      if (tool === 'emulator') setEmulatorPrompt(true);
      else navigate(tool);
    },
    [navigate],
  );

  /**
   * Dropping a service card on the pinned rail pins it. It never unpins: a drop
   * is an instruction to add, and removing a pin stays a deliberate click.
   */
  const pinServiceById = useCallback(
    (id: string) => {
      const service = state.services.find(item => item.id === id);
      if (!service) return;
      if (service.pinned) {
        pushToast(t('{name} is already pinned.', { name: service.name }), 'info');
        return;
      }
      setState(current => togglePin(current, id));
      pushToast(t('{name} pinned.', { name: service.name }), 'success');
    },
    [pushToast, state.services, t],
  );

  const toggleToolPinInState = useCallback(
    (tool: SecretToolId) => {
      const name = t(SECRET_TOOL_LABELS[tool]);
      const pinned = state.settings.pinnedTools.includes(tool);
      setState(current => toggleToolPin(current, tool));
      pushToast(pinned ? t('{name} unpinned.', { name }) : t('{name} pinned.', { name }), 'info');
    },
    [pushToast, state.settings.pinnedTools, t],
  );

  const updateEmulator = useCallback((patch: Partial<SettingsModel['emulator']>) => {
    setState(current =>
      updateSettings(current, {
        emulator: { ...current.settings.emulator, ...patch },
      }),
    );
  }, []);

  /**
   * The link's on/off switch. The socket follows the state, so the main process
   * is only told the intent; it never writes the setting back.
   */
  const updateLink = useCallback((enabled: boolean) => {
    setState(current => updateSettings(current, { link: { enabled } }));
    pushToast(
      enabled
        ? t('Kyvex Link is listening. Open its page on the phone.')
        : t('Kyvex Link stopped listening.'),
      'info',
    );
  }, [pushToast, t]);

  const updateLexium = useCallback((patch: Partial<SettingsModel['lexium']>) => {
    setState(current =>
      updateSettings(current, { lexium: { ...current.settings.lexium, ...patch } }),
    );
  }, []);

  const updatePlayer = useCallback((patch: Partial<SettingsModel['player']>) => {
    setState(current =>
      updateSettings(current, { player: { ...current.settings.player, ...patch } }),
    );
  }, []);

  const updateDisk = useCallback((patch: Partial<SettingsModel['disk']>) => {
    setState(current =>
      updateSettings(current, { disk: { ...current.settings.disk, ...patch } }),
    );
  }, []);

  const updateHome = useCallback((patch: Partial<SettingsModel['home']>) => {
    setState(current => updateSettings(current, { home: { ...current.settings.home, ...patch } }));
  }, []);

  // The capture preview's "New capture" hands the user back to the field that
  // takes one: Home, with the capture card showing, rather than a hidden widget.
  useEffect(() => {
    if (!isElectron || !window.kryvex?.onCaptureAsk) return undefined;
    return window.kryvex.onCaptureAsk(() => {
      updateHome({ showCapture: true });
      navigate('home');
    });
  }, [isElectron, navigate, updateHome]);

  // A save taken in the capture window is a capture the board has seen, so the
  // recent list stays the record of what this machine has kept.
  useEffect(() => {
    if (!isElectron || !window.kryvex?.onCaptureSaved) return undefined;
    return window.kryvex.onCaptureSaved(entry => {
      setState(current =>
        updateSettings(current, {
          home: {
            ...current.settings.home,
            screenCaptures: addScreenCapture(current.settings.home.screenCaptures, {
              ...entry,
              id: makeId('cap'),
              createdAt: Date.now(),
            }),
          },
        }),
      );
    });
  }, [isElectron]);

  const toggleResources = useCallback(() => {
    setResourcesOpen(value => !value);
    if (!state.settings.resources.enabled) {
      updateSettingsPatch({ resources: { ...state.settings.resources, enabled: true } });
    }
  }, [state.settings.resources, updateSettingsPatch]);

  const updateParty = useCallback(
    (patch: Partial<SettingsModel['party']>) => {
      setState(current =>
        updateSettings(current, { party: { ...current.settings.party, ...patch } }),
      );
    },
    [],
  );

  const rebuildEmbeddedPages = useCallback(() => {
    const runningTabs =
      route.view === 'browser' ? tabs.filter(tab => tab.url !== '').length : 0;
    setEngineRevision(current => current + 1);
    return openIds.length + runningTabs;
  }, [openIds.length, route.view, tabs]);

  const pickWallpaper = useCallback(
    async (file: File) => {
      const result = await importWallpaper(file);
      if (!result.ok || !result.image) {
        pushToast(t(result.message), 'danger');
        return;
      }
      setWallpaper(result.image);
      // Choosing a file is intent: show it, even if the switch was off.
      setState(current =>
        updateSettings(current, {
          wallpaper: { ...current.settings.wallpaper, enabled: true, source: 'image' },
        }),
      );
      pushToast(t(result.message), 'success');
    },
    [pushToast, t],
  );

  const removeWallpaper = useCallback(async () => {
    const ok = await clearWallpaper();
    if (ok) {
      setWallpaper(null);
      // Without an image the only honest backdrop left is the theme wash.
      setState(current =>
        updateSettings(current, {
          wallpaper: { ...current.settings.wallpaper, source: 'gradient' },
        }),
      );
    }
    pushToast(t(ok ? 'Wallpaper removed.' : 'The wallpaper could not be removed.'), ok ? 'info' : 'danger');
  }, [pushToast, t]);

  const checkForUpdates = useCallback(async () => {
    if (!window.kryvex) return;
    try {
      const next = await window.kryvex.updateCheck();
      if (next) setUpdate(next);
      // A manual check that finds nothing is still an answer: say so plainly
      // instead of leaving the panel looking as if nothing happened.
      if (next?.phase === 'current') {
        pushToast(
          t('Kryvex {version} is up to date.', {
            version: next.latestVersion ?? next.currentVersion,
          }),
          'success',
        );
      }
    } catch {
      pushToast(t('The update check failed.'), 'danger');
    }
  }, [pushToast, t]);

  const downloadUpdate = useCallback(async () => {
    if (!window.kryvex) return;
    try {
      const next = await window.kryvex.updateDownload();
      if (!next) return;
      setUpdate(next);
      pushToast(
        next.phase === 'ready'
          ? t('Update downloaded and verified.')
          : t('The update could not be downloaded.'),
        next.phase === 'ready' ? 'success' : 'danger',
      );
    } catch {
      pushToast(t('The update could not be downloaded.'), 'danger');
    }
  }, [pushToast, t]);

  const installUpdate = useCallback(async () => {
    if (!window.kryvex) return;
    const started = await window.kryvex.updateInstall().catch(() => false);
    if (started) pushToast(t('Closing Kryvex to run the installer…'), 'info');
  }, [pushToast, t]);

  const revealUpdate = useCallback(async () => {
    if (!window.kryvex) return;
    const shown = await window.kryvex.updateReveal().catch(() => false);
    if (!shown) pushToast(t('The downloaded file could not be shown.'), 'warning');
  }, [pushToast, t]);

  const openUpdateRelease = useCallback(() => {
    void window.kryvex?.updateOpenRelease().catch(() => undefined);
  }, []);

  const resetWorkspace = useCallback(() => {
    setConfirmRequest({
      title: t('Reset the workspace?'),
      body: t(
        'Services, bookmarks, history and preferences are replaced with the starter set. This cannot be undone.',
      ),
      label: t('Reset everything'),
      onConfirm: () => {
        const starters = newState();
        setState(starters);
        // The engine reads its launch profile from the state file, so the
        // running process has to be told about the reset too.
        void window.kryvex?.chromiumSet(starters.settings.chromium).catch(() => undefined);
        setTabs([]);
        setActiveTabId(null);
        setOpenIds([]);
        setUnread({});
        unreadRef.current = {};
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

  const addFeeds = useCallback((feeds: RssFeed[]) => {
    setState(current => addFeedsToState(current, feeds));
  }, []);

  const removeFeed = useCallback((id: string) => {
    setState(current => removeFeedFromState(current, id));
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

  // Secret services that own a running process rather than a webview: the
  // shared lifecycle decides whether they keep running, pause or stop when the
  // user is looking somewhere else.
  const emulatorLifecycle = useLifecycle(
    'emulator',
    route.view === 'emulator',
    state.settings.lifecycle,
  );
  const diskLifecycle = useLifecycle('disk', route.view === 'disk', state.settings.lifecycle);
  const roomsLifecycle = useLifecycle('rooms', route.view === 'rooms', state.settings.lifecycle);

  const requestedPanel = route.query.get('panel');
  const initialBrowserPanel: BrowserPanel | null =
    requestedPanel === 'downloads' || requestedPanel === 'history' || requestedPanel === 'bookmarks'
      ? requestedPanel
      : null;

  const unreadTotal = useMemo(() => totalUnread(unread), [unread]);

  useEffect(() => {
    document.title = windowTitle(unreadTotal);
  }, [unreadTotal]);

  // The main process grants desktop notifications only while this stays on.
  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    void window.kryvex
      .serviceSetNotifications(state.settings.serviceNotifications)
      .catch(() => undefined);
  }, [isElectron, state.settings.serviceNotifications]);

  // Kyvex Link: the saved switch is the intent, so a profile that left it on
  // starts listening again without the user opening the Link page.
  useEffect(() => {
    if (!isElectron || !window.kryvex?.linkConfigure) return;
    void window.kryvex
      .linkConfigure({ enabled: state.settings.link.enabled })
      .catch(() => undefined);
  }, [isElectron, state.settings.link.enabled]);

  // A paired phone reaches the shell through the main process: a link opens in
  // the browser, Rooms and Home are just a route. Nothing else crosses.
  useEffect(() => {
    if (!isElectron || !window.kryvex?.onLinkCommand) return;
    return window.kryvex.onLinkCommand(event => {
      if (event.command === 'open-url') openExternalTab(event.url);
      else navigate(event.command);
    });
  }, [isElectron, navigate, openExternalTab]);

  // The phone gets notices of its own; the desktop gets a toast for the events
  // the main process noticed while the Link page was closed.
  useEffect(() => {
    if (!isElectron || !window.kryvex?.onLinkNotice) return;
    return window.kryvex.onLinkNotice(notice => pushToast(t(notice.message), notice.tone));
  }, [isElectron, pushToast, t]);

  // Per-module mute/notification policy. Muted audio is enforced in both the
  // renderer (immediately) and the main process (for guests loaded later).
  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    for (const service of state.services) {
      void window.kryvex
        .serviceSetPolicy(partitionFor(service.id), {
          notifications: service.notifications !== false,
          muted: Boolean(service.muted),
        })
        .catch(() => undefined);
    }
  }, [isElectron, state.services]);

  // The main process needs the VPN profile before it can auto-connect.
  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    void window.kryvex.vpnConfigure(state.settings.vpn).catch(() => undefined);
  }, [isElectron, state.settings.vpn]);

  const vpnAutoConnected = useRef(false);
  useEffect(() => {
    if (!isElectron || !window.kryvex || vpnAutoConnected.current) return;
    if (!state.settings.vpn.enabled || !state.settings.vpn.autoConnect) return;
    if (!state.settings.vpn.binaryPath || !state.settings.vpn.configPath) return;
    vpnAutoConnected.current = true;
    void window.kryvex
      .vpnConnect()
      .then(status => {
        const phase = (status as { phase?: string } | null)?.phase;
        if (phase === 'error' || phase === 'missing') {
          pushToast(t('The VPN profile could not start automatically.'), 'warning');
        }
      })
      .catch(() => undefined);
  }, [isElectron, pushToast, state.settings.vpn, t]);

  const resourceWatch =
    state.settings.resources.enabled &&
    (resourcesOpen || (state.settings.resources.sidebar && !state.settings.sidebarCollapsed));
  const resources = useResourceSnapshot(state.services, resourceWatch);
  // Media state is pushed from the main process, so this costs nothing until a
  // service page actually plays something.
  const serviceMedia = useServiceMedia(isElectron);
  const { setVolume: setServiceVolume, setRepeat: setServiceRepeat } = serviceMedia;

  // Page media is a different engine from the local player, so its saved
  // volume and loop are pushed to the main process whenever they change. The
  // main process keeps them for guests that load later in this session.
  useEffect(() => {
    setServiceVolume(state.settings.player.serviceVolume);
  }, [setServiceVolume, state.settings.player.serviceVolume]);

  useEffect(() => {
    setServiceRepeat(state.settings.player.serviceRepeat);
  }, [setServiceRepeat, state.settings.player.serviceRepeat]);

  // Spotify's ad guard is a main-process poll over service guests, so the
  // saved switch is sent once per change and once at launch. Off is also sent,
  // which stops any timer a previous toggle started.
  useEffect(() => {
    if (!isElectron) return;
    void window.kryvex
      ?.spotifyAdGuard(state.settings.player.spotifyAdGuard)
      .catch(() => undefined);
  }, [isElectron, state.settings.player.spotifyAdGuard]);

  /**
   * Force-closes one module. The main process ends its guests first, because a
   * wedged renderer can outlive the React tree; removing the id afterwards
   * drops the frame instead of leaving a dead surface behind.
   */
  const stopService = useCallback(
    (service: Service) => {
      void (async () => {
        const stopped = await window.kryvex
          ?.serviceStop(partitionFor(service.id))
          .catch(() => 0);
        setOpenIds(current => current.filter(id => id !== service.id));
        setUnread(current => {
          if (!(service.id in current)) return current;
          const next = { ...current };
          delete next[service.id];
          return next;
        });
        if (route.serviceId === service.id) navigate('services');
        pushToast(
          stopped
            ? t('{name} was force-closed.', { name: service.name })
            : t('{name} is not running.', { name: service.name }),
          'warning',
        );
      })();
    },
    [navigate, pushToast, route.serviceId, t],
  );

  // Update state lives in the main process; the shell only renders it and
  // forwards explicit user actions. Announce a new version once per session.
  useEffect(() => {
    if (!isElectron || !window.kryvex) return;
    let alive = true;
    const apply = (next: UpdateStatus | null) => {
      if (!alive || !next) return;
      setUpdate(next);
      if (
        next.phase === 'available' &&
        next.latestVersion &&
        announcedUpdate.current !== next.latestVersion
      ) {
        announcedUpdate.current = next.latestVersion;
        pushToast(
          t('Kryvex {version} is available. Open Settings to install it.', {
            version: next.latestVersion,
          }),
          'info',
        );
      }
    };
    void window.kryvex
      .updateStatus()
      .then(apply)
      .catch(() => undefined);
    const stop = window.kryvex.onUpdateChanged(apply);
    return () => {
      alive = false;
      stop();
    };
  }, [isElectron, pushToast, t]);

  useEffect(() => {
    if (!ready || !isElectron || !window.kryvex || !state.settings.autoCheckUpdates) return;
    if (autoChecked.current) return;
    autoChecked.current = true;
    const run = () => {
      void window.kryvex
        ?.updateCheck()
        .then(next => {
          if (next) setUpdate(next);
        })
        .catch(() => undefined);
    };
    // Give the window time to paint before spending startup time on network.
    const timer = window.setTimeout(run, 3000);
    const interval = window.setInterval(run, 6 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [isElectron, ready, state.settings.autoCheckUpdates]);

  const title = useMemo(() => {
    if (route.serviceId) return activeService?.name ?? t('Missing module');
    switch (route.view) {
      case 'services':
        return t('Services');
      case 'browser':
        return t('Browser');
      case 'workspace':
        return t('Workspace');
      case 'assistant':
        return 'Vexium';
      case 'rooms':
        return t('Rooms');
      case 'settings':
        return t('Settings');
      case 'emulator':
        return t('Secret emulator');
      case 'lexium':
        return 'Lexium';
      case 'player':
        return t('Media player');
      case 'disk':
        return t('Disk pulse');
      case 'link':
        // A product name, identical in every language.
        return 'Kyvex Link';
      default:
        return t('Home');
    }
  }, [activeService?.name, route.serviceId, route.view, t]);

  // The backdrop is opt-in: with the switch off the theme alone paints the
  // window. The gradient source is derived from theme tokens, never a fixed
  // rainbow, so it always matches the active colour scheme.
  const wallpaperPrefs = state.settings.wallpaper;
  const usingImage =
    wallpaperPrefs.enabled && wallpaperPrefs.source === 'image' && wallpaper !== null;
  const usingWash = wallpaperPrefs.enabled && !usingImage;
  const wallpaperStyle =
    usingImage || usingWash
      ? ({
          '--wallpaper-image': usingImage
            ? `url("${wallpaper?.dataUrl}")`
            : 'var(--wallpaper-wash)',
          '--wallpaper-veil': `color-mix(in srgb, var(--bg) ${wallpaperPrefs.veil}%, transparent)`,
        } as CSSProperties)
      : undefined;

  return (
    <I18nProvider value={i18n}>
    <PlayerProvider settings={state.settings.player} onUpdate={updatePlayer}>
    <div
      className={`app ${isElectron ? 'is-electron' : 'is-web'} ${
        state.settings.showStatusBar ? '' : 'no-status'
      } ${usingImage || usingWash ? 'has-wallpaper' : ''}`}
      data-wallpaper={usingImage ? wallpaperPrefs.fit : undefined}
      style={wallpaperStyle}
    >
      <Header
        title={title}
        view={route.view}
        onPalette={() => setPaletteOpen(true)}
        onCapture={openCapture}
        onAdd={() => setDialog({ mode: 'new' })}
        onSettings={() => navigate('settings')}
        onHelp={() => setHelpOpen(true)}
        onResources={toggleResources}
        resourcesOpen={resourcesOpen}
        onUpdate={() => {
          if (route.view === 'settings') {
            document.getElementById('updates')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          } else {
            navigate('settings?section=updates');
          }
        }}
        update={
          update && ['available', 'downloading', 'ready'].includes(update.phase)
            ? {
                available: true,
                ready: update.phase === 'ready',
                version: update.latestVersion,
              }
            : null
        }
        isElectron={isElectron}
        mark={themeMark}
      />

      <Sidebar
        state={state}
        routeView={route.view}
        unread={unread}
        collapsed={state.settings.sidebarCollapsed}
        onToggle={() => updateSettingsPatch({ sidebarCollapsed: !state.settings.sidebarCollapsed })}
        onNavigate={view => navigate(view)}
        onOpenService={openService}
        onOpenTool={openSecretTool}
        onAdd={() => setDialog({ mode: 'new' })}
        resources={resources}
        showResources={state.settings.resources.sidebar && !state.settings.sidebarCollapsed}
        onHideResources={() =>
          updateSettingsPatch({
            resources: { ...state.settings.resources, sidebar: false },
          })
        }
        onServiceMenu={(service, point) => setServiceMenu({ service, point })}
        onReorderPinned={(id, beforeId) =>
          setState(current => moveService(current, id, beforeId))
        }
        onPinService={pinServiceById}
      />

      <main className={`app-main ${activeService ? 'is-service' : ''}`}>
        <ServiceStage
          services={state.services}
          openIds={openIds}
          activeId={activeService?.id ?? null}
          reloadTokens={reloadTokens}
          engineRevision={engineRevision}
          isElectron={isElectron}
          unread={unread}
          notifications={state.settings.serviceNotifications}
          mark={themeMark}
          canvas={route.view === 'workspace' ? canvas : null}
          windows={windows}
          motion={state.settings.workspace}
          onBack={() => navigate('services')}
          onEdit={service => setDialog({ mode: 'edit', service })}
          onDelete={deleteService}
          onClearSession={clearServiceSession}
          onTitle={handleServiceTitle}
          onUpdateService={updateServiceFlags}
          onToast={pushToast}
          onFloat={floatService}
          onDock={dockService}
          onWindowMove={moveServiceWindow}
          onWindowResize={resizeServiceWindow}
          onWindowRaise={raiseServiceWindow}
          onWindowClose={closeServiceWindow}
          onWindowMinimize={minimizeServiceWindow}
          onWindowMaximize={maximizeServiceWindow}
        />

        <KeepAlive
          id="emulator"
          active={route.view === 'emulator'}
          keep={emulatorLifecycle.keepMounted}
        >
          <Emulator
            settings={state.settings.emulator}
            lifecycle={emulatorLifecycle}
            onUpdate={updateEmulator}
            onBack={() => navigate('services')}
            onOpenRooms={() => navigate('rooms')}
            onToast={pushToast}
          />
        </KeepAlive>

        <KeepAlive id="disk" active={route.view === 'disk'} keep={diskLifecycle.keepMounted}>
          <DiskPulse
            settings={state.settings.disk}
            onUpdate={updateDisk}
            onBack={() => navigate('services')}
            onToast={pushToast}
          />
        </KeepAlive>


        <KeepAlive id="rooms" active={route.view === 'rooms'} keep={roomsLifecycle.keepMounted}>
          <Rooms
            settings={state.settings.party}
            isElectron={isElectron}
            initialRoom={route.query.get('room')}
            onUpdateParty={updateParty}
            onToast={pushToast}
          />
        </KeepAlive>

        {route.serviceId ? (
          activeService ? null : (
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
            capturePulse={capturePulse}
            onOpenService={openService}
            onAdd={() => setDialog({ mode: 'new' })}
            onNavigate={view => navigate(view)}
            onUpdateHome={updateHome}
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
            onUpdateService={updateServiceFlags}
            onSecretTool={openSecretTool}
            onToggleToolPin={toggleToolPinInState}
            onUpdateEmulator={updateEmulator}
            onUpdatePlayer={updatePlayer}
            onEnableSecretServices={() => {
              updateSettingsPatch({ secretServices: true });
              pushToast(t('Secret services enabled.'), 'success');
            }}
          />
        ) : route.view === 'workspace' ? (
          <Workspace
            windows={windows}
            motion={state.settings.workspace}
            onRect={setCanvas}
            onAdd={() => setDialog({ mode: 'new', target: 'workspace' })}
            onDropService={(id, at) => {
              const service = state.services.find(item => item.id === id);
              if (service) openInWorkspace(service, at);
            }}
            onMotion={patch =>
              updateSettingsPatch({
                workspace: { ...state.settings.workspace, ...patch },
              })
            }
          />
        ) : route.view === 'assistant' ? (
          <Assistant
            state={state}
            isElectron={isElectron}
            onAssistantChange={patch =>
              updateSettingsPatch({
                assistant: { ...state.settings.assistant, ...patch },
              })
            }
            onOpenSettings={() => navigate('settings?section=assistant')}
            onSearch={query =>
              openExternalTab(
                resolveAddress(
                  query,
                  state.settings.searchEngine,
                  state.settings.searchRegion,
                ),
              )
            }
          />
        ) : route.view === 'emulator' || route.view === 'disk' || route.view === 'rooms' ? (
          // Rendered by the keep-alive panes below so the service survives a
          // navigation instead of being destroyed with the route.
          null
        ) : route.view === 'lexium' ? (
          <Lexium
            settings={state.settings.lexium}
            onUpdate={updateLexium}
            onBack={() => navigate('services')}
            onToast={pushToast}
          />
        ) : route.view === 'player' ? (
          <Player
            onBack={() => navigate('services')}
            onOpenLink={openExternalTab}
            onToast={pushToast}
          />
        ) : route.view === 'link' ? (
          // The link keeps no renderer state: the server and every pairing live
          // in the main process, so this view can mount and unmount freely.
          <Link
            settings={state.settings.link}
            onToggle={updateLink}
            onBack={() => navigate('services')}
            onToast={pushToast}
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
            engineRevision={engineRevision}
            mark={themeMark}
            feeds={state.feeds}
            onAddFeeds={addFeeds}
            onRemoveFeed={removeFeed}
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
            wallpaper={wallpaper}
            onPickWallpaper={file => void pickWallpaper(file)}
            onClearWallpaper={() => void removeWallpaper()}
            onUpdate={updateSettingsPatch}
            onReset={resetWorkspace}
            onToast={pushToast}
            onRebuildPages={rebuildEmbeddedPages}
            update={update}
            focusUpdates={route.query.get('section') === 'updates'}
            focusAssistant={route.query.get('section') === 'assistant'}
            focusResources={route.query.get('section') === 'resources'}
            onCheckUpdate={() => void checkForUpdates()}
            onDownloadUpdate={() => void downloadUpdate()}
            onInstallUpdate={() => void installUpdate()}
            onRevealUpdate={() => void revealUpdate()}
            onOpenRelease={openUpdateRelease}
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
          media={serviceMedia.entries}
          onOpenMediaService={openService}
          onMediaControl={serviceMedia.control}
          mediaVolume={state.settings.player.serviceVolume}
          mediaRepeat={state.settings.player.serviceRepeat}
          onMediaVolume={value => {
            updatePlayer({ serviceVolume: value });
            serviceMedia.setVolume(value);
          }}
          onMediaRepeat={repeat => {
            updatePlayer({ serviceRepeat: repeat });
            serviceMedia.setRepeat(repeat);
          }}
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

      {firstLook ? (
        <ThemeGallery
          variant="overlay"
          themeId={themeId}
          onPick={(id, name) => {
            updateSettingsPatch({ themeId: id, themeGallerySeen: true });
            pushToast(t('{name} theme applied.', { name }), 'success');
          }}
          onClose={() => updateSettingsPatch({ themeGallerySeen: true })}
        />
      ) : null}

      {serviceMenu ? (
        <ServiceContextMenu
          service={serviceMenu.service}
          point={serviceMenu.point}
          notificationsGloballyOn={state.settings.serviceNotifications}
          onClose={() => setServiceMenu(null)}
          onOpen={() => openService(serviceMenu.service)}
          onEdit={() => setDialog({ mode: 'edit', service: serviceMenu.service })}
          onRemove={() => deleteService(serviceMenu.service)}
          onChange={patch => {
            updateServiceFlags(serviceMenu.service, patch);
            setServiceMenu(current =>
              current ? { ...current, service: { ...current.service, ...patch } } : current,
            );
          }}
        />
      ) : null}

      {resourcesOpen ? (
        <ResourcePanel
          snapshot={resources}
          services={state.services}
          isElectron={isElectron}
          onStopService={stopService}
          onClose={() => setResourcesOpen(false)}
          onOpenSettings={() => {
            setResourcesOpen(false);
            navigate('settings?section=resources');
          }}
        />
      ) : null}

      {/* The transport lives in the status bar. When that bar is hidden the
          same dock falls back to a floating island so playback stays reachable. */}
      {!state.settings.showStatusBar && serviceMedia.entries.length > 0 ? (
        <ServiceMediaDock
          variant="floating"
          entries={serviceMedia.entries}
          services={state.services}
          onOpenService={openService}
          onControl={serviceMedia.control}
          volume={state.settings.player.serviceVolume}
          repeat={state.settings.player.serviceRepeat}
          onVolume={value => {
            updatePlayer({ serviceVolume: value });
            serviceMedia.setVolume(value);
          }}
          onRepeat={repeat => {
            updatePlayer({ serviceRepeat: repeat });
            serviceMedia.setRepeat(repeat);
          }}
        />
      ) : null}

      <InstallPrompt />

      {emulatorPrompt ? (
        <Modal
          title={t('Before you load a cartridge')}
          subtitle={t('Secret emulator')}
          width={520}
          onClose={() => setEmulatorPrompt(false)}
          footer={
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setEmulatorPrompt(false)}>
                {t('Cancel')}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setEmulatorPrompt(false);
                  navigate('emulator');
                }}
              >
                <Icon name="check" size={14} />
                {t('I understand')}
              </button>
            </div>
          }
        >
          <div className="emulator-consent">
            <Icon name="warning" size={20} />
            <div>
              <p>
                {t(
                  'Kryvex does not provide, host, link to or endorse ROMs, BIOS files or any copyrighted game data. The emulator only plays files you already have, and you are responsible for having the legal right to use them.',
                )}
              </p>
              <p className="mono">
                {t('No downloads · no catalogue · everything stays on this machine')}
              </p>
            </div>
          </div>
        </Modal>
      ) : null}

      <PlayerBar onExpand={() => navigate('player')} />

      <ToastHost toasts={toasts} />
    </div>
    </PlayerProvider>
    </I18nProvider>
  );
}
