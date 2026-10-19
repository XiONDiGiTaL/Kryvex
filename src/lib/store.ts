import type {
  Bookmark,
  BrowserTab,
  Density,
  HistoryEntry,
  LanguageSetting,
  PersistedState,
  SearchEngine,
  Service,
  ServiceCategory,
  Settings,
  ViewId,
} from '../types';
import { LANGUAGE_SETTINGS } from '../types';
import { BRAND_ICONS } from './brand-icons';
import { CATEGORIES, SERVICE_COLORS, starterState } from './services';
import { isThemeId } from './themes';
import { hostOf, isHttpUrl } from './url';

const VIEWS: ViewId[] = ['home', 'services', 'browser', 'settings'];
const DENSITIES: Density[] = ['comfortable', 'compact'];
const ENGINES: SearchEngine[] = ['duckduckgo', 'google', 'bing'];
const MAX_SERVICES = 100;
const MAX_BOOKMARKS = 200;
const MAX_HISTORY = 500;
const MAX_RECENT = 8;
const MAX_TABS = 20;
const SAFE_ID = /^[a-z0-9-]{1,64}$/;

export function newState(): PersistedState {
  return starterState();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeService(raw: unknown): Service | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? '').toLowerCase();
  if (!SAFE_ID.test(id)) return null;
  const name = String(raw.name ?? '').trim();
  const url = String(raw.url ?? '');
  if (!name || name.length > 80 || !isHttpUrl(url)) return null;
  const category = CATEGORIES.some(item => item.id === raw.category)
    ? (raw.category as ServiceCategory)
    : 'other';
  const color = SERVICE_COLORS.includes(raw.color as (typeof SERVICE_COLORS)[number])
    ? String(raw.color)
    : SERVICE_COLORS[0];
  const letter = /^[\p{L}\p{N}]{1,2}$/u.test(String(raw.letter ?? ''))
    ? String(raw.letter).toUpperCase()
    : name.charAt(0).toUpperCase();
  const icon =
    typeof raw.icon === 'string' && raw.icon in BRAND_ICONS ? (raw.icon as Service['icon']) : undefined;
  return {
    id,
    name,
    url,
    category,
    color,
    letter,
    pinned: Boolean(raw.pinned),
    createdAt: Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : Date.now(),
    lastOpened: Number.isFinite(raw.lastOpened) ? Number(raw.lastOpened) : undefined,
    ...(icon ? { icon } : {}),
  };
}

function sanitizeBookmark(raw: unknown): Bookmark | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? '').toLowerCase();
  const url = String(raw.url ?? '');
  const title = String(raw.title ?? '').trim();
  if (!SAFE_ID.test(id) || !isHttpUrl(url)) return null;
  return {
    id,
    url,
    title: title.slice(0, 120) || url,
    createdAt: Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : Date.now(),
  };
}

function sanitizeHistoryEntry(raw: unknown): HistoryEntry | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? '').toLowerCase();
  const url = String(raw.url ?? '');
  const title = String(raw.title ?? '').trim();
  if (!SAFE_ID.test(id) || !isHttpUrl(url)) return null;
  return {
    id,
    url,
    title: title.slice(0, 160) || url,
    visitedAt: Number.isFinite(raw.visitedAt) ? Number(raw.visitedAt) : Date.now(),
  };
}

function sanitizeTab(raw: unknown): BrowserTab | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? '').toLowerCase();
  if (!SAFE_ID.test(id)) return null;
  const url = String(raw.url ?? '');
  if (url !== '' && !isHttpUrl(url)) return null;
  const title = String(raw.title ?? '').trim().slice(0, 200);
  return { id, url, title: title || (url ? hostOf(url) : 'New tab') };
}

function sanitizeBrowser(raw: unknown): PersistedState['browser'] {
  const source = isRecord(raw) ? raw : {};
  const tabs: BrowserTab[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(source.tabs) ? source.tabs : []) {
    const tab = sanitizeTab(item);
    if (tab && !seen.has(tab.id) && tabs.length < MAX_TABS) {
      seen.add(tab.id);
      tabs.push(tab);
    }
  }
  const requested = typeof source.activeTabId === 'string' ? source.activeTabId.toLowerCase() : null;
  const activeTabId = tabs.some(tab => tab.id === requested)
    ? requested
    : (tabs[0]?.id ?? null);
  return { tabs, activeTabId };
}

function sanitizeSettings(raw: unknown): Settings {
  const base = starterState().settings;
  if (!isRecord(raw)) return base;
  return {
    themeId: typeof raw.themeId === 'string' && isThemeId(raw.themeId) ? raw.themeId : base.themeId,
    density: DENSITIES.includes(raw.density as Density) ? (raw.density as Density) : base.density,
    startView: VIEWS.includes(raw.startView as ViewId) ? (raw.startView as ViewId) : base.startView,
    language: LANGUAGE_SETTINGS.includes(raw.language as LanguageSetting)
      ? (raw.language as LanguageSetting)
      : base.language,
    sidebarCollapsed: Boolean(raw.sidebarCollapsed),
    showStatusBar: raw.showStatusBar === undefined ? true : Boolean(raw.showStatusBar),
    searchEngine: ENGINES.includes(raw.searchEngine as SearchEngine)
      ? (raw.searchEngine as SearchEngine)
      : base.searchEngine,
    confirmBeforeDelete: raw.confirmBeforeDelete === undefined ? true : Boolean(raw.confirmBeforeDelete),
  };
}

/**
 * Never trust a state file: users can edit it, and older versions may not
 * match the current shape. Anything invalid is dropped, never fatal.
 */
export function sanitizeState(raw: unknown): PersistedState {
  if (!isRecord(raw)) return starterState();
  const defaults = starterState();

  const servicesRaw = Array.isArray(raw.services) ? raw.services : defaults.services;
  const services: Service[] = [];
  const seen = new Set<string>();
  for (const item of servicesRaw) {
    const service = sanitizeService(item);
    if (service && !seen.has(service.id) && services.length < MAX_SERVICES) {
      seen.add(service.id);
      services.push(service);
    }
  }

  const bookmarks: Bookmark[] = [];
  const bookmarkIds = new Set<string>();
  for (const item of Array.isArray(raw.bookmarks) ? raw.bookmarks : []) {
    const bookmark = sanitizeBookmark(item);
    if (bookmark && !bookmarkIds.has(bookmark.id) && bookmarks.length < MAX_BOOKMARKS) {
      bookmarkIds.add(bookmark.id);
      bookmarks.push(bookmark);
    }
  }

  const history: HistoryEntry[] = [];
  const historyIds = new Set<string>();
  for (const item of Array.isArray(raw.history) ? raw.history : []) {
    const entry = sanitizeHistoryEntry(item);
    if (entry && !historyIds.has(entry.id) && history.length < MAX_HISTORY) {
      historyIds.add(entry.id);
      history.push(entry);
    }
  }

  const recent = (Array.isArray(raw.recent) ? raw.recent : [])
    .map(value => String(value).toLowerCase())
    .filter(value => seen.has(value))
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, MAX_RECENT);

  return {
    version: 1,
    services,
    bookmarks,
    history,
    settings: sanitizeSettings(raw.settings),
    recent,
    browser: sanitizeBrowser(raw.browser),
  };
}

export function addService(state: PersistedState, service: Service): PersistedState {
  if (state.services.length >= MAX_SERVICES) return state;
  if (state.services.some(item => item.id === service.id)) return state;
  return { ...state, services: [...state.services, service] };
}

export function updateService(state: PersistedState, service: Service): PersistedState {
  return {
    ...state,
    services: state.services.map(item => (item.id === service.id ? { ...service } : item)),
  };
}

export function removeService(state: PersistedState, id: string): PersistedState {
  return {
    ...state,
    services: state.services.filter(item => item.id !== id),
    recent: state.recent.filter(item => item !== id),
  };
}

export function togglePin(state: PersistedState, id: string): PersistedState {
  const target = state.services.find(item => item.id === id);
  if (!target) return state;
  return {
    ...state,
    services: state.services.map(item =>
      item.id === id ? { ...item, pinned: !item.pinned } : item,
    ),
  };
}

export function markOpened(state: PersistedState, id: string): PersistedState {
  if (!state.services.some(item => item.id === id)) return state;
  return {
    ...state,
    services: state.services.map(item =>
      item.id === id ? { ...item, lastOpened: Date.now() } : item,
    ),
    recent: [id, ...state.recent.filter(item => item !== id)].slice(0, MAX_RECENT),
  };
}

export function addBookmark(state: PersistedState, bookmark: Bookmark): PersistedState {
  if (state.bookmarks.some(item => item.url === bookmark.url)) return state;
  return {
    ...state,
    bookmarks: [bookmark, ...state.bookmarks].slice(0, MAX_BOOKMARKS),
  };
}

export function removeBookmark(state: PersistedState, id: string): PersistedState {
  return { ...state, bookmarks: state.bookmarks.filter(item => item.id !== id) };
}

export function addHistory(state: PersistedState, entry: HistoryEntry): PersistedState {
  const latest = state.history[0];
  if (
    latest &&
    latest.url === entry.url &&
    latest.title === entry.title &&
    Math.abs(entry.visitedAt - latest.visitedAt) < 15_000
  ) {
    return state;
  }
  return { ...state, history: [entry, ...state.history].slice(0, MAX_HISTORY) };
}

export function removeHistory(state: PersistedState, id: string): PersistedState {
  return { ...state, history: state.history.filter(item => item.id !== id) };
}

export function clearHistory(state: PersistedState): PersistedState {
  if (state.history.length === 0) return state;
  return { ...state, history: [] };
}

export function updateSettings(state: PersistedState, patch: Partial<Settings>): PersistedState {
  return { ...state, settings: sanitizeSettings({ ...state.settings, ...patch }) };
}

export function startHash(state: PersistedState): string {
  return `#/${state.settings.startView}`;
}
