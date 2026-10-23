import type {
  Bookmark,
  BrowserTab,
  Density,
  DiskSettings,
  HistoryEntry,
  LanguageSetting,
  PersistedState,
  Service,
  ServiceCategory,
  AssistantSettings,
  EmulatorSettings,
  HomeNote,
  HomeSettings,
  LexiumSettings,
  PartySettings,
  PlayerSettings,
  RepeatMode,
  ResourceSettings,
  SearchRegion,
  Settings,
  ViewId,
  VpnSettings,
  WallpaperFit,
  WallpaperSettings,
  WellnessActivity,
  WellnessDay,
  WellnessProfile,
  WellnessSettings,
  WellnessSex,
  WellnessUnits,
} from '../types';
import { LANGUAGE_SETTINGS } from '../types';
import { BRAND_ICONS } from './brand-icons';
import { sanitizeChromium } from './chromium';
import {
  PEER_COLORS,
  sanitizeDisplayName,
  sanitizeIceServers,
  sanitizeRecentRooms,
  sanitizeTrackers,
} from './party-rules';
import {
  DEFAULT_DISK,
  DEFAULT_EMULATOR,
  DEFAULT_HOME,
  DEFAULT_LEXIUM,
  DEFAULT_PLAYER,
  DEFAULT_RESOURCES,
  DEFAULT_VPN,
  DEFAULT_WELLNESS,
} from './defaults';
import {
  MAX_CONDITIONS,
  MAX_SLEEP_GOAL_MINUTES,
  MAX_WELLNESS_DAYS,
  MAX_WATER_GOAL_ML,
  MIN_SLEEP_GOAL_MINUTES,
  MIN_WATER_GOAL_ML,
  isBedtime,
  isDayKey,
} from './wellness';
import { cleanLanguage, cleanOcrLanguage, normalizeBaseUrl } from './lexium';
import { clampVolume } from './player';
import { isSearchEngine, isSearchRegion } from './search-engines';
import { isEmulatorSystem } from './emulator';
import { CATEGORIES, SERVICE_COLORS, starterState } from './services';
import { themeGallerySeenValue } from './theme-gallery';
import { isThemeId, sanitizeCustomTheme } from './themes';
import { hostOf, isHttpUrl } from './url';
import { sanitizeFeeds } from './rss';
import { normalizeWidgetAreas, normalizeWidgetOrder } from './home-widgets';

const VIEWS: ViewId[] = ['home', 'services', 'browser', 'assistant', 'settings'];
const DENSITIES: Density[] = ['comfortable', 'compact'];
const WALLPAPER_FITS: WallpaperFit[] = ['cover', 'contain', 'tile'];
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
    ...(raw.muted === true ? { muted: true } : {}),
    ...(raw.notifications === false ? { notifications: false } : {}),
    ...(raw.persistence === 'pause' ? { persistence: 'pause' as const } : {}),
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

/** Private tabs never survive a restart; only ordinary tabs are persisted. */
function isPrivateTab(raw: unknown): boolean {
  return isRecord(raw) && raw.private === true;
}

function sanitizeBrowser(raw: unknown): PersistedState['browser'] {
  const source = isRecord(raw) ? raw : {};
  const tabs: BrowserTab[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(source.tabs) ? source.tabs : []) {
    if (isPrivateTab(item)) continue;
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

/**
 * Only the loopback runtimes Vexium knows about are accepted: Ollama, LM
 * Studio, and a model file Kryvex serves itself.
 */
export function sanitizeAssistant(raw: unknown): AssistantSettings {
  const base = starterState().settings.assistant;
  if (!isRecord(raw)) return base;
  const provider: AssistantSettings['provider'] =
    raw.provider === 'lmstudio' || raw.provider === 'ollama' || raw.provider === 'local'
      ? raw.provider
      : base.provider;
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().slice(0, 200) : '';
  const model = typeof raw.model === 'string' ? raw.model.trim().slice(0, 120) : '';
  return {
    provider,
    baseUrl: baseUrl || base.baseUrl,
    model: /[\u0000-\u001f]/.test(model) ? '' : model,
  };
}

/**
 * Veil strength is clamped so a saved value can never hide or wash out the UI.
 * The feature stays off unless a state file explicitly turned it on, so both
 * new installs and older profiles paint the theme alone.
 */
export function sanitizeWallpaper(raw: unknown): WallpaperSettings {
  const base = starterState().settings.wallpaper;
  if (!isRecord(raw)) return base;
  const veil = Number(raw.veil);
  return {
    enabled: raw.enabled === true,
    source: raw.source === 'image' ? 'image' : 'gradient',
    fit: WALLPAPER_FITS.includes(raw.fit as WallpaperFit)
      ? (raw.fit as WallpaperFit)
      : base.fit,
    veil: Number.isFinite(veil) ? Math.min(90, Math.max(0, Math.round(veil))) : base.veil,
  };
}

function cleanText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, limit) : '';
}

function sanitizeNotes(raw: unknown): HomeNote[] {
  if (!Array.isArray(raw)) return [];
  const notes: HomeNote[] = [];
  for (const item of raw.slice(0, 40)) {
    if (!isRecord(item)) continue;
    const text = cleanText(item.text, 160);
    if (!text) continue;
    notes.push({
      id: typeof item.id === 'string' ? item.id.slice(0, 64) : `n-${notes.length + 1}`,
      text,
      done: item.done === true,
      createdAt: Number.isFinite(item.createdAt) ? Number(item.createdAt) : Date.now(),
    });
  }
  return notes;
}

function coordinate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

/**
 * Goals are clamped rather than rejected: a hand-edited file with an absurd
 * water goal should come back at the nearest sane value, not silently reset to
 * the default and lose the user's intent.
 */
function clampedNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

const WELLNESS_UNITS: WellnessUnits[] = ['metric', 'imperial'];
const WELLNESS_ACTIVITIES: WellnessActivity[] = ['low', 'light', 'moderate', 'high'];
const WELLNESS_SEXES: WellnessSex[] = ['female', 'male', 'unspecified'];

function sanitizeWellnessDay(raw: unknown): WellnessDay | null {
  if (!isRecord(raw) || !isDayKey(raw.date)) return null;
  return {
    date: raw.date,
    waterMl: Math.round(boundedNumber(raw.waterMl, 0, 10_000) ?? 0),
    sleepMinutes: Math.round(boundedNumber(raw.sleepMinutes, 0, 1440) ?? 0),
    weightKg: boundedNumber(raw.weightKg, 25, 400),
    calories: boundedNumber(raw.calories, 0, 10_000),
    taskDone: raw.taskDone === true,
    checkedIn: raw.checkedIn === true,
  };
}

/**
 * The wellness block is opt-in: an unreadable or missing value must come back as
 * off, never as an empty widget that looks enabled. Measurements are stored in
 * metric whatever the display unit, so changing units never rewrites history.
 */
export function sanitizeWellness(raw: unknown): WellnessSettings {
  const base = DEFAULT_WELLNESS;
  const empty = (): WellnessSettings => ({ ...base, profile: { ...base.profile }, days: [] });
  if (!isRecord(raw)) return empty();

  const profileRaw = isRecord(raw.profile) ? raw.profile : {};
  const profile: WellnessProfile = {
    units: WELLNESS_UNITS.includes(profileRaw.units as WellnessUnits)
      ? (profileRaw.units as WellnessUnits)
      : base.profile.units,
    heightCm: boundedNumber(profileRaw.heightCm, 90, 250),
    weightKg: boundedNumber(profileRaw.weightKg, 25, 400),
    birthYear: boundedNumber(profileRaw.birthYear, 1900, new Date().getFullYear()),
    sex: WELLNESS_SEXES.includes(profileRaw.sex as WellnessSex)
      ? (profileRaw.sex as WellnessSex)
      : base.profile.sex,
    activity: WELLNESS_ACTIVITIES.includes(profileRaw.activity as WellnessActivity)
      ? (profileRaw.activity as WellnessActivity)
      : base.profile.activity,
    conditions: cleanText(profileRaw.conditions, MAX_CONDITIONS),
  };

  const days: WellnessDay[] = [];
  if (Array.isArray(raw.days)) {
    for (const item of raw.days.slice(-MAX_WELLNESS_DAYS * 2)) {
      const day = sanitizeWellnessDay(item);
      if (!day) continue;
      const seen = days.findIndex(existing => existing.date === day.date);
      if (seen >= 0) days[seen] = day;
      else days.push(day);
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const onboarded = raw.onboarded === true;
  return {
    onboarded,
    enabled: onboarded && raw.enabled === true,
    profile,
    days: days.slice(-MAX_WELLNESS_DAYS),
    waterGoalMl: Math.round(
      clampedNumber(raw.waterGoalMl, MIN_WATER_GOAL_ML, MAX_WATER_GOAL_ML) ?? base.waterGoalMl,
    ),
    sleepGoalMinutes: Math.round(
      clampedNumber(raw.sleepGoalMinutes, MIN_SLEEP_GOAL_MINUTES, MAX_SLEEP_GOAL_MINUTES) ??
        base.sleepGoalMinutes,
    ),
    bedtime: isBedtime(raw.bedtime) ? raw.bedtime : base.bedtime,
    remindWater: raw.remindWater === true,
    remindSleep: raw.remindSleep === true,
  };
}

/** Home board values are deliberately small: a widget, not a second app. */
export function sanitizeHome(raw: unknown): HomeSettings {
  const base = DEFAULT_HOME;
  if (!isRecord(raw)) return { ...base, notes: [], wellness: sanitizeWellness(undefined) };
  // `Number(null)` is 0, which would silently turn an unset location into Null
  // Island and show its weather as "local". Only a value the user actually
  // saved may become a coordinate; an empty field stays unset.
  const latitude = coordinate(raw.latitude);
  const longitude = coordinate(raw.longitude);
  const city = cleanText(raw.city, 80);
  const place = cleanText(raw.place, 80);
  // Builds before this guard stored `0,0` whenever the location was unset,
  // because `Number(null)` is 0. With no city or place name that point can only
  // be that old default, so read it as unset instead of Null Island weather.
  const inheritedDefault = !city && !place && latitude === 0 && longitude === 0;
  const hasPoint =
    latitude !== null &&
    longitude !== null &&
    !inheritedDefault &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  // Before the widget registry, notes were on for everyone and there was no
  // Notes button to close them. A file without an order predates that button,
  // so its `true` is the old default rather than a choice: read it once as
  // closed, then the saved order keeps whatever the user does next.
  const legacyWidgets = !Array.isArray(raw.widgetOrder);
  return {
    showBoard: raw.showBoard === undefined ? base.showBoard : raw.showBoard === true,
    showWeather: raw.showWeather === undefined ? base.showWeather : raw.showWeather === true,
    showTasks: legacyWidgets ? false : raw.showTasks === true,
    // `showMomentum`/`momentumSeen` were the old field names; keep reading
    // them once so an existing workspace does not lose its board preference.
    showGuide:
      raw.showGuide === undefined
        ? raw.showMomentum === undefined
          ? base.showGuide
          : raw.showMomentum === true
        : raw.showGuide === true,
    city,
    place,
    latitude: hasPoint ? latitude : null,
    longitude: hasPoint ? longitude : null,
    showWellness: raw.showWellness === true,
    wellness: sanitizeWellness(raw.wellness),
    // A file written before the widget registry has no order or columns, so
    // both are derived from the registry defaults instead of being dropped.
    widgetOrder: normalizeWidgetOrder(raw.widgetOrder),
    widgetAreas: normalizeWidgetAreas(raw.widgetAreas),
    unit: raw.unit === 'f' ? 'f' : 'c',
    notes: sanitizeNotes(raw.notes),
    guideSeen: raw.guideSeen === true || raw.momentumSeen === true,
  };
}

export function sanitizeResources(raw: unknown): ResourceSettings {
  const base = DEFAULT_RESOURCES;
  if (!isRecord(raw)) return { ...base };
  return {
    enabled: raw.enabled === true,
    sidebar: raw.sidebar === undefined ? base.sidebar : raw.sidebar === true,
  };
}

export function sanitizeVpn(raw: unknown): VpnSettings {
  const base = DEFAULT_VPN;
  if (!isRecord(raw)) return { ...base };
  return {
    enabled: raw.enabled === true,
    binaryPath: cleanText(raw.binaryPath, 1024),
    configPath: cleanText(raw.configPath, 1024),
    extraArgs: cleanText(raw.extraArgs, 500),
    dns: cleanText(raw.dns, 200),
    proxy: cleanText(raw.proxy, 300),
    autoConnect: raw.autoConnect === true,
  };
}

export function sanitizeEmulator(raw: unknown): EmulatorSettings {
  const base = DEFAULT_EMULATOR;
  if (!isRecord(raw)) return { ...base };
  const scale = Number(raw.scale);
  return {
    system: isEmulatorSystem(raw.system) ? raw.system : 'nes',
    scale: Number.isFinite(scale) ? Math.min(5, Math.max(1, Math.round(scale))) : base.scale,
    gamepad: raw.gamepad === undefined ? base.gamepad : raw.gamepad === true,
    crt: raw.crt === undefined ? base.crt : raw.crt === true,
  };
}

const LEXIUM_ENGINES = ['local-whisper', 'whisper-cpp', 'openai'] as const;
const REPEAT_MODES: RepeatMode[] = ['off', 'all', 'one'];

/** Lexium keeps addresses, not secrets: the key is optional and local. */
export function sanitizeLexium(raw: unknown): LexiumSettings {
  const base = DEFAULT_LEXIUM;
  if (!isRecord(raw)) return { ...base };
  const engine = LEXIUM_ENGINES.includes(raw.engine as (typeof LEXIUM_ENGINES)[number])
    ? (raw.engine as LexiumSettings['engine'])
    : base.engine;
  return {
    engine,
    baseUrl: normalizeBaseUrl(raw.baseUrl) || (raw.baseUrl === '' ? '' : base.baseUrl),
    model: cleanText(raw.model, 48) || base.model,
    language: cleanLanguage(raw.language, 'auto'),
    target: cleanLanguage(raw.target, 'en') || base.target,
    translateUrl: normalizeBaseUrl(raw.translateUrl) || (raw.translateUrl === '' ? '' : base.translateUrl),
    apiKey: cleanText(raw.apiKey, 160),
    ocrLanguage: cleanOcrLanguage(raw.ocrLanguage),
  };
}

export function sanitizeDisk(raw: unknown): DiskSettings {
  if (!isRecord(raw)) return { ...DEFAULT_DISK };
  const accepted = Number(raw.disclaimerAcceptedAt);
  return {
    disclaimerAcceptedAt:
      Number.isFinite(accepted) && accepted > 0 && accepted <= Date.now() ? accepted : 0,
  };
}

export function sanitizePlayer(raw: unknown): PlayerSettings {
  const base = DEFAULT_PLAYER;
  if (!isRecord(raw)) return { ...base };
  return {
    volume: clampVolume(Number(raw.volume)),
    repeat: REPEAT_MODES.includes(raw.repeat as RepeatMode) ? (raw.repeat as RepeatMode) : base.repeat,
    shuffle: raw.shuffle === true,
    // A missing field must not read as 0 and silence every service page for
    // someone upgrading from a build that never had this setting.
    serviceVolume:
      typeof raw.serviceVolume === 'number' ? clampVolume(raw.serviceVolume) : base.serviceVolume,
    serviceRepeat: raw.serviceRepeat === true,
    // Missing reads as off: an upgrade must not start muting a module.
    spotifyAdGuard: raw.spotifyAdGuard === true,
  };
}

/** Room identity and relays. Empty lists fall back so Rooms always works. */
export function sanitizeParty(raw: unknown): PartySettings {
  const base = starterState().settings.party;
  if (!isRecord(raw)) return base;
  const trackers = sanitizeTrackers(raw.trackers);
  const iceServers = sanitizeIceServers(raw.iceServers);
  return {
    displayName: sanitizeDisplayName(raw.displayName),
    color:
      typeof raw.color === 'string' && PEER_COLORS.includes(raw.color) ? raw.color : base.color,
    trackers: trackers.length > 0 ? trackers : base.trackers,
    iceServers: iceServers.length > 0 ? iceServers : base.iceServers,
    recentRooms: sanitizeRecentRooms(raw.recentRooms),
  };
}

function sanitizeSettings(raw: unknown): Settings {
  const base = starterState().settings;
  if (!isRecord(raw)) return base;
  return {
    themeId: typeof raw.themeId === 'string' && isThemeId(raw.themeId) ? raw.themeId : base.themeId,
    themeGallerySeen: themeGallerySeenValue(raw.themeGallerySeen),
    customTheme: sanitizeCustomTheme(raw.customTheme),
    density: DENSITIES.includes(raw.density as Density) ? (raw.density as Density) : base.density,
    startView: VIEWS.includes(raw.startView as ViewId) ? (raw.startView as ViewId) : base.startView,
    language: LANGUAGE_SETTINGS.includes(raw.language as LanguageSetting)
      ? (raw.language as LanguageSetting)
      : base.language,
    sidebarCollapsed: Boolean(raw.sidebarCollapsed),
    showStatusBar: raw.showStatusBar === undefined ? true : Boolean(raw.showStatusBar),
    searchEngine: isSearchEngine(raw.searchEngine) ? raw.searchEngine : base.searchEngine,
    searchRegion: isSearchRegion(raw.searchRegion)
      ? (raw.searchRegion as SearchRegion)
      : base.searchRegion,
    confirmBeforeDelete: raw.confirmBeforeDelete === undefined ? true : Boolean(raw.confirmBeforeDelete),
    serviceNotifications:
      raw.serviceNotifications === undefined ? true : Boolean(raw.serviceNotifications),
    autoCheckUpdates: raw.autoCheckUpdates === undefined ? true : Boolean(raw.autoCheckUpdates),
    wallpaper: sanitizeWallpaper(raw.wallpaper),
    assistant: sanitizeAssistant(raw.assistant),
    chromium: sanitizeChromium(raw.chromium),
    party: sanitizeParty(raw.party),
    home: sanitizeHome(raw.home),
    resources: sanitizeResources(raw.resources),
    vpn: sanitizeVpn(raw.vpn),
    emulator: sanitizeEmulator(raw.emulator),
    lexium: sanitizeLexium(raw.lexium),
    player: sanitizePlayer(raw.player),
    disk: sanitizeDisk(raw.disk),
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
    feeds: sanitizeFeeds(raw.feeds),
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

/**
 * Feeds are matched by URL, so importing the same OPML twice is a no-op.
 * The first entry wins and the list stays inside the persisted limit.
 */
export function addFeeds(state: PersistedState, incoming: PersistedState['feeds']): PersistedState {
  const known = new Set(state.feeds.map(feed => feed.url));
  const next = [...state.feeds];
  for (const feed of incoming) {
    if (known.has(feed.url)) continue;
    known.add(feed.url);
    next.push(feed);
    if (next.length >= 12) break;
  }
  return next.length === state.feeds.length ? state : { ...state, feeds: next };
}

export function removeFeed(state: PersistedState, id: string): PersistedState {
  return { ...state, feeds: state.feeds.filter(feed => feed.id !== id) };
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
