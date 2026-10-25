import type {
  BrandIconKey
} from './lib/brand-icons';
// The engine profile is a contract with the main process: one type, one
// sanitizer, defined next to the Electron wiring and shared with the UI.
import type { ChromiumSettings, EngineInfo } from '../electron/chromium-rules';
import type { PopupTabInfo, PopupTabRect } from '../electron/types';
export type {
  PopupTabInfo,
  PopupTabRect,
  ServiceMediaEvent,
  ServiceMediaState,
} from '../electron/types';
export type {
  ChromiumColorScheme,
  ChromiumSettings,
  EngineGuest,
  EngineInfo,
} from '../electron/chromium-rules';

export type ViewId =
  | 'home'
  | 'services'
  | 'browser'
  | 'assistant'
  | 'rooms'
  | 'settings'
  | 'emulator'
  | 'lexium'
  | 'player'
  | 'disk';

export type ServiceCategory =
  | 'communication'
  | 'productivity'
  | 'development'
  | 'ai'
  | 'resources'
  | 'media'
  | 'other';

export type ServicePersistence = 'keep' | 'pause';

/**
 * What a service does when it is no longer on screen.
 *
 * These are the five answers the lifecycle panel offers: keep it running,
 * keep it running but silent, pause on leave, pause after a stretch of
 * inactivity, or stop it outright. Pinning is unrelated: a pinned service is
 * only one that is easy to reach, never one that must burn resources.
 */
export type LifecycleMode = 'keep' | 'mute' | 'pause' | 'auto-pause' | 'stop';

/** Services that own a running process instead of a plain webview. */
export type LifecycleServiceId = 'emulator' | 'disk' | 'rooms' | 'modules';

export interface LifecycleSettings {
  /** Applied to every service that does not override it. */
  mode: LifecycleMode;
  /** Minutes of inactivity before `auto-pause` suspends a service. */
  idleMinutes: number;
  /** Per-service exceptions; a missing entry inherits `mode`. */
  overrides: Partial<Record<LifecycleServiceId, LifecycleMode>>;
}

export interface Service {
  id: string;
  name: string;
  url: string;
  category: ServiceCategory;
  color: string;
  letter: string;
  pinned: boolean;
  createdAt: number;
  lastOpened?: number;
  /** Known brand glyph; unknown services fall back to their favicon, then the letter. */
  icon?: BrandIconKey;
  /** Silences every page in this module without changing the page's own setting. */
  muted?: boolean;
  /** Desktop notifications for this module. Defaults to the global switch. */
  notifications?: boolean;
  /** Keep the session warm, or pause media and mute while another view is used. */
  persistence?: ServicePersistence;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

export type DownloadState = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';

export interface DownloadRecord {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
  state: DownloadState;
  startedAt: number;
  updatedAt: number;
}

export interface DownloadResult {
  ok: boolean;
  message: string;
  records: DownloadRecord[];
}

export interface DownloadLocation {
  path: string;
  torrentPath: string;
  isDefault: boolean;
}

export interface DownloadLocationResult {
  ok: boolean;
  message: string;
  location: DownloadLocation | null;
}

export type TorrentState = 'metadata' | 'downloading' | 'paused' | 'seeding' | 'error';
export type TorrentSource = 'magnet' | 'file';

export interface TorrentFileRecord {
  name: string;
  path: string;
  length: number;
  downloaded: number;
  progress: number;
}

export interface TorrentRecord {
  id: string;
  name: string;
  infoHash: string;
  magnetURI: string;
  source: TorrentSource;
  savePath: string;
  state: TorrentState;
  length: number;
  downloaded: number;
  uploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  ratio: number;
  progress: number;
  timeRemaining: number;
  peers: number;
  seeders: number;
  leechers: number;
  protocols: string[];
  trackers: string[];
  files: TorrentFileRecord[];
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface TorrentResult {
  ok: boolean;
  message: string;
  records: TorrentRecord[];
  record?: TorrentRecord;
}

export type MediaPermission = 'microphone' | 'camera';

export interface PermissionPrompt {
  id: string;
  origin: string;
  host: string;
  devices: MediaPermission[];
}

export interface DefaultBrowserStatus {
  supported: boolean;
  isDefault: boolean;
  canRegister: boolean;
  detail?: string;
}

export type Density = 'comfortable' | 'compact';
export type SearchEngine =
  | 'duckduckgo'
  | 'google'
  | 'bing'
  | 'yandex'
  | 'mojeek'
  | 'kagi'
  | 'swisscows'
  | 'metager'
  | 'searxng'
  | 'dogpile'
  | 'marginalia'
  | 'yep'
  | 'perplexity'
  | 'you'
  | 'baidu'
  | 'naver'
  | 'daum'
  | 'seznam'
  | 'coccoc'
  | 'sogou'
  | 'petal';
/** A country filter for the regional engine list. */
export type SearchRegion = 'global' | 'cn' | 'kr' | 'cz' | 'vn' | 'intl';
export const LANGUAGE_SETTINGS = ['system', 'en', 'es', 'de', 'fr'] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];
export type ResolvedLanguage = Exclude<LanguageSetting, 'system'>;

export type WallpaperFit = 'cover' | 'contain' | 'tile';

export type WallpaperSource = 'gradient' | 'image';

/** Small, JSON-safe wallpaper preferences; the image bytes live elsewhere. */
export interface WallpaperSettings {
  /** Off by default: the theme alone paints the window. */
  enabled: boolean;
  /** Theme-derived colour wash, or the user's own image once one is chosen. */
  source: WallpaperSource;
  fit: WallpaperFit;
  /** Theme-coloured veil strength over the backdrop, 0–90. */
  veil: number;
}

/** The stored background image, resolved at launch. */
export type AssistantProvider = 'ollama' | 'lmstudio' | 'local';

/** Vexium points at a runtime the user already runs; no key is ever stored. */
export interface AssistantSettings {
  provider: AssistantProvider;
  baseUrl: string;
  model: string;
  /**
   * Set once the old Ollama default has been replaced by Vexium Core. It keeps
   * a later choice of Ollama from being migrated again on the next launch.
   */
  migrated?: boolean;
}

export type LocalModelPhase = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

/** A GGUF file the user chose, plus the llama.cpp server serving it. */
export interface ModelMemoryEstimate {
  minBytes: number;
  maxBytes: number;
  contextTokens: number;
}

/** One reviewed artifact. The renderer receives facts, never a URL. */
export interface ModelCatalogueEntry {
  id: string;
  name: string;
  /** First-party product name for the bundled stack, when there is one. */
  productName?: string;
  publisher: string;
  repository: string;
  revision: string;
  filename: string;
  bytes: number;
  sha256: string;
  licence: string;
  licenceUrl: string;
  quantisation: string;
  architecture: string;
  contextLength: number;
  languages: string[];
  capabilities: string[];
  limitations: string[];
  memory: ModelMemoryEstimate;
  commercialUse: boolean;
}

export interface ModelInstalledRow {
  id: string;
  name: string;
  filename: string;
  bytes: number;
  sha256: string;
  installedAt: string;
  licence: string;
  revision: string;
  present: boolean;
  path: string;
}

export type ModelDownloadPhase = 'downloading' | 'verifying' | 'installed' | 'cancelled' | 'failed';

export interface ModelDownloadProgress {
  id: string;
  phase: ModelDownloadPhase;
  received: number;
  total: number;
  error?: string;
}

export interface ModelDownloadResult {
  ok: boolean;
  model?: ModelInstalledRow;
  error?: string;
}

export interface LocalModelStatus {
  phase: LocalModelPhase;
  path: string;
  name: string;
  baseUrl: string;
  port: number | null;
  binary: string;
  binaryFound: boolean;
  bundled: boolean;
  runtimeVersion: string;
  pid: number | null;
  startedAt: number | null;
  ctxSize: number;
  gpuLayers: number;
  log: string;
  error?: string;
}

export interface LocalModelPatch {
  path?: string;
  binary?: string;
  ctxSize?: number;
  gpuLayers?: number;
}

export type AssistantRole = 'system' | 'user' | 'assistant';

export interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

export interface AssistantProbe {
  ok: boolean;
  models: string[];
  error?: string;
  status?: number;
}

export interface AssistantChatResult {
  ok: boolean;
  error?: string;
  status?: number;
}

export interface AssistantDelta {
  requestId: string;
  delta?: string;
  done?: boolean;
  error?: string;
}

export interface AssistantChatRequest {
  requestId: string;
  baseUrl: string;
  model: string;
  messages: AssistantMessage[];
  /** One verified line from Kryvex's own tools, when one answered. */
  facts?: string;
}

export interface WallpaperImage {
  dataUrl: string;
  bytes: number;
  addedAt: number;
}

export interface CustomTheme {
  name: string;
  bg: string;
  surface: string;
  accent: string;
  accentSoft: string;
  ink: string;
}

/** Rooms: link-only hangouts with no account and no Kryvex server. */
export interface PartySettings {
  /** Empty means "Guest" plus a short session suffix. */
  displayName: string;
  color: string;
  /** WebSocket relays that carry WebRTC signaling only. */
  trackers: string[];
  /** STUN/TURN entries handed to the browser's ICE configuration. */
  iceServers: string[];
  recentRooms: string[];
}

/** One shareable capture target offered by the main process. */
export interface PartySource {
  id: string;
  kind: 'screen' | 'window' | 'app';
  name: string;
  detail?: string;
  thumbnail?: string;
}

export interface HomeNote {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export type WellnessUnits = 'metric' | 'imperial';
export type WellnessActivity = 'low' | 'light' | 'moderate' | 'high';
export type WellnessSex = 'female' | 'male' | 'unspecified';

/**
 * What the intake form asks once. Every field is optional: a height and weight
 * are enough for the derived numbers, and the rest only sharpens them.
 */
export interface WellnessProfile {
  units: WellnessUnits;
  heightCm: number | null;
  weightKg: number | null;
  /** Only the year is kept, which is all the calorie estimate needs. */
  birthYear: number | null;
  sex: WellnessSex;
  activity: WellnessActivity;
  /** Free text the user chose to note; it is stored, never interpreted. */
  conditions: string;
}

/** One day of the log. Every number is entered by the user, never fetched. */
export interface WellnessDay {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  waterMl: number;
  sleepMinutes: number;
  weightKg: number | null;
  calories: number | null;
  taskDone: boolean;
  checkedIn: boolean;
}

/**
 * The optional wellness widget. It is off until someone opens the intake form,
 * and everything it knows lives in the same local state file as the rest of the
 * workspace.
 */
export interface WellnessSettings {
  enabled: boolean;
  onboarded: boolean;
  profile: WellnessProfile;
  /** Oldest first, capped by MAX_WELLNESS_DAYS. */
  days: WellnessDay[];
  waterGoalMl: number;
  sleepGoalMinutes: number;
  /** HH:MM in local time. */
  bedtime: string;
  remindWater: boolean;
  remindSleep: boolean;
}

export type HomeWidgetId =
  | 'weather'
  | 'wellness'
  | 'notes'
  | 'calculator'
  | 'currency'
  | 'guide';
export type HomeWidgetArea = 'main' | 'side';

/** The Home board is an overlay, not a new start page: it sits over the theme. */
export interface HomeSettings {
  showBoard: boolean;
  showWeather: boolean;
  /** Sticky notes. Kept under its historical name so saved state still loads. */
  showTasks: boolean;
  showGuide: boolean;
  /** Wellness stays off by default: it is opt-in, not a second dashboard. */
  showWellness: boolean;
  showCalculator: boolean;
  showCurrency: boolean;
  /** Last currency pair chosen, kept as three-letter ISO codes. */
  currencyFrom: string;
  currencyTo: string;
  /** Position of every widget, across both columns. */
  widgetOrder: HomeWidgetId[];
  /** Which column each widget occupies. */
  widgetAreas: Record<HomeWidgetId, HomeWidgetArea>;
  wellness: WellnessSettings;
  city: string;
  /** Country or region label returned by geocoding, for the city chip. */
  place: string;
  latitude: number | null;
  longitude: number | null;
  unit: 'c' | 'f';
  notes: HomeNote[];
  /** The in-house board guide opens once; it stays available afterwards. */
  guideSeen: boolean;
}

export interface ResourceSettings {
  /** Show the floating resource panel button and poll the main process. */
  enabled: boolean;
  /** Show the compact CPU/Memory/GPU bars under the sidebar services. */
  sidebar: boolean;
}

/** OpenVPN is user-supplied: Kryvex never downloads or bundles a binary. */
export interface VpnSettings {
  /** Draw the VPN status in the header and sidebar. */
  enabled: boolean;
  binaryPath: string;
  configPath: string;
  /** Passed as separate argv entries after validation, never through a shell. */
  extraArgs: string;
  /** Added as dhcp-option DNS entries when non-empty. */
  dns: string;
  /** http(s)/socks5 proxy passed to OpenVPN. */
  proxy: string;
  autoConnect: boolean;
}

export type EmulatorSystem =
  | 'nes'
  | 'snes'
  | 'gb'
  | 'gba'
  | 'sms'
  | 'gg'
  | 'genesis'
  | 'sega32x'
  | 'sg1000'
  | 'ws'
  | 'wsc'
  | 'atari2600'
  | 'atari7800'
  | 'lynx'
  | 'pce'
  | 'sgx'
  | 'ngp'
  | 'ngpc'
  | 'vb';

export interface EmulatorSettings {
  system: EmulatorSystem;
  scale: number;
  gamepad: boolean;
  /** Keep the CRT scanline treatment over the canvas. */
  crt: boolean;
}

export type LexiumEngine = 'local-whisper' | 'whisper-cpp' | 'openai';

/** Lexium: the in-house translator, transcriber and OCR reader. */
export interface LexiumSettings {
  /** Which speech-to-text server the Transcribe tab talks to. */
  engine: LexiumEngine;
  /** Loopback (or LAN) base URL of that server; nothing is sent to Kryvex. */
  baseUrl: string;
  /** Model name for local-whisper/OpenAI-compatible servers; whisper.cpp picks its model at launch. */
  model: string;
  /** Spoken language, or 'auto' to let the engine detect it. */
  language: string;
  /** Translation target used by every tab. */
  target: string;
  /** LibreTranslate-compatible base URL. */
  translateUrl: string;
  /** Optional key for a hosted LibreTranslate instance. Stored locally only. */
  apiKey: string;
  /** Tesseract language pack used by the image reader. */
  ocrLanguage: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

/** Media player preferences; the queue itself stays in memory. */
export interface PlayerSettings {
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  /** Volume for media playing inside a service page, separate from the player. */
  serviceVolume: number;
  /** Loop the clip a service page is playing instead of letting it advance. */
  serviceRepeat: boolean;
  /**
   * Opt-in Spotify ad handling: mute the module while the page shows an ad and
   * press its own Next control once. Off unless the user asks for it.
   */
  spotifyAdGuard: boolean;
  /**
   * What the audio stage draws behind the player. Only rows Kryvex decodes can
   * feed it, so an embedded YouTube video keeps its own picture.
   */
  visualizer: 'off' | 'bars' | 'wave' | 'radial' | 'ambient';
  /** Multiplier on the drawn amplitude, 0.5-2. */
  visualizerIntensity: number;
}

export type TypographyFont = 'default' | 'system' | 'humanist' | 'serif' | 'mono';

/**
 * Global text appearance: one scale for every UI size token and one curated
 * family. It applies to Kryvex's own chrome, never inside an embedded page.
 */
export interface TypographySettings {
  /** Percentage of the design sizes, clamped to 85-135. */
  scale: number;
  font: TypographyFont;
}

export interface Settings {
  themeId: string;
  /** False only on a fresh install, until the first-run theme gallery is closed. */
  themeGallerySeen: boolean;
  /** User-authored palette used by the built-in Custom theme tile. */
  customTheme: CustomTheme;
  density: Density;
  startView: ViewId;
  language: LanguageSetting;
  sidebarCollapsed: boolean;
  showStatusBar: boolean;
  searchEngine: SearchEngine;
  /** Narrows the engine picker to one region; global lists every engine. */
  searchRegion: SearchRegion;
  confirmBeforeDelete: boolean;
  /** Desktop notifications from persistent service modules. */
  serviceNotifications: boolean;
  /** Ask GitHub for a newer release shortly after launch. */
  autoCheckUpdates: boolean;
  /** Background image laid behind the workspace. */
  wallpaper: WallpaperSettings;
  /** Local model runtime used by Vexium. */
  assistant: AssistantSettings;
  /** Chromium engine preferences for every embedded page. */
  chromium: ChromiumSettings;
  /** Rooms identity and signaling configuration. */
  party: PartySettings;
  /** Home overlay: weather, tasks and the board guide. */
  home: HomeSettings;
  /** In-house per-process resource monitor. */
  resources: ResourceSettings;
  /** User-supplied OpenVPN executor settings. */
  vpn: VpnSettings;
  /** Secret 8-bit emulator service preferences. */
  emulator: EmulatorSettings;
  /** Secret translator/transcriber preferences. */
  lexium: LexiumSettings;
  /** Secret media player preferences. */
  player: PlayerSettings;
  /** Secret storage tool: the disclaimer is accepted once, not per visit. */
  disk: DiskSettings;
  /** What happens to a service after the user navigates away from it. */
  lifecycle: LifecycleSettings;
  /** Global text size and family for the Kryvex interface. */
  typography: TypographySettings;
}

export interface DiskSettings {
  /** 0 until the user accepts the cleanup disclaimer. */
  disclaimerAcceptedAt: number;
}

/** What the shell sends to the main-process Whisper proxy. */
export interface LexiumProxyRequest {
  engine: string;
  baseUrl: string;
  model: string;
  language: string;
  filename: string;
  /** Base64 WAV bytes; the proxy caps the decoded size. */
  audio: string;
}

export interface LexiumProxyResult {
  ok: boolean;
  error?: 'offline' | 'http' | 'invalid';
  status?: number;
  detail?: string;
  payload?: unknown;
}

export interface LexiumProbeResult {
  ok: boolean;
  error?: 'offline' | 'invalid';
  status?: number;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  /** Private tabs are memory-only: no history, no saved session. */
  private?: boolean;
}

export interface RssFeed {
  id: string;
  title: string;
  url: string;
  addedAt: number;
}

export interface RssItem {
  id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: number | null;
}

export interface RssFetchResult {
  ok: boolean;
  text: string;
  url: string;
  error?: 'invalid-url' | 'unavailable' | 'too-large' | 'not-feed';
}

export interface BrowserSession {
  tabs: BrowserTab[];
  activeTabId: string | null;
}

export interface PersistedState {
  version: 1;
  services: Service[];
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  settings: Settings;
  recent: string[];
  browser: BrowserSession;
  /** Feeds shown on the browser start page. */
  feeds: RssFeed[];
}

export interface AppInfo {
  version: string;
  platform: string;
  electron: string;
  chrome: string;
  node: string;
  packaged: boolean;
}

export interface ShieldStatus {
  enabled: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'error';
  ready: boolean;
  blocked: number;
  filters: number;
  lists: string[];
  updatedAt: number | null;
  autoUpdate: boolean;
  httpsUpgrade: boolean;
  stripTracking: boolean;
  fingerprint: boolean;
  /** The user's own uBO-syntax rules exactly as stored. */
  customFilters: string;
  customEnabled: boolean;
  customScriptlets: boolean;
  customRules: number;
  customSkipped: number;
  customLines: number;
  customLimit: number;
  youtube: boolean;
  httpsUpgrades: number;
  paramsStripped: number;
  error?: string;
}

export interface ShieldCustomPatch {
  text?: string;
  enabled?: boolean;
  scriptlets?: boolean;
  youtube?: boolean;
}

export interface ShieldCustomFileResult {
  ok: boolean;
  message: string;
  status: ShieldStatus;
}

export interface ExtensionRecord {
  key: string;
  name: string;
  version: string;
  manifestVersion: number;
  enabled: boolean;
  installedAt: number;
  loaded: boolean;
  error?: string;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'current'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

export type UpdateMode = 'installed' | 'portable' | 'source';

export type UpdateErrorCode =
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'no-release'
  | 'invalid-release'
  | 'no-asset'
  | 'download-failed'
  | 'checksum-missing'
  | 'checksum-failed'
  | 'too-large'
  | 'unsupported'
  | 'unknown';

export interface UpdateStatus {
  phase: UpdatePhase;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  notes?: string;
  pageUrl?: string;
  assetName?: string;
  assetSize?: number;
  receivedBytes: number;
  progress: number;
  mode: UpdateMode;
  canInstall: boolean;
  canReveal: boolean;
  checkedAt: number | null;
  error?: UpdateErrorCode;
}

export interface KryvexBridge {
  platform: string;
  loadState: () => Promise<unknown>;
  saveState: (state: unknown) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  appInfo: () => Promise<AppInfo | null>;
  rssFetch: (url: string) => Promise<RssFetchResult>;
  shieldStatus: () => Promise<ShieldStatus>;
  shieldSetEnabled: (enabled: boolean) => Promise<ShieldStatus>;
  shieldUpdate: () => Promise<ShieldStatus>;
  shieldSetOption: (option: string, enabled: boolean) => Promise<ShieldStatus>;
  shieldSetCustom: (patch: ShieldCustomPatch) => Promise<ShieldStatus>;
  shieldImportFilters: () => Promise<ShieldCustomFileResult>;
  shieldExportFilters: () => Promise<ShieldCustomFileResult>;
  extensionsList: () => Promise<ExtensionRecord[]>;
  extensionsInstall: () => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
  extensionsInstallFolder: () => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
  extensionsInstallWebStore: (
    extensionId: string,
  ) => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
  extensionsSetEnabled: (
    key: string,
    enabled: boolean,
  ) => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
  extensionsRemove: (key: string) => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
  downloadsList: () => Promise<DownloadRecord[]>;
  downloadsLocation: () => Promise<DownloadLocation | null>;
  downloadsChooseLocation: () => Promise<DownloadLocationResult>;
  downloadsResetLocation: () => Promise<DownloadLocationResult>;
  downloadsPause: (id: string) => Promise<boolean>;
  downloadsCancel: (id: string) => Promise<boolean>;
  downloadsShow: (id: string) => Promise<boolean>;
  downloadsOpen: (id: string) => Promise<boolean>;
  downloadsRemove: (id: string, deleteFile: boolean) => Promise<DownloadResult>;
  downloadsClear: () => Promise<DownloadRecord[]>;
  onDownloadsChanged: (listener: (records: DownloadRecord[]) => void) => () => void;
  torrentsList: () => Promise<TorrentRecord[]>;
  torrentsAddMagnet: (magnet: string) => Promise<TorrentResult>;
  torrentsAddFile: () => Promise<TorrentResult>;
  torrentsPause: (id: string) => Promise<TorrentResult>;
  torrentsResume: (id: string) => Promise<TorrentResult>;
  torrentsShow: (id: string) => Promise<boolean>;
  torrentsRemove: (id: string, deleteData: boolean) => Promise<TorrentResult>;
  onTorrentsChanged: (listener: (records: TorrentRecord[]) => void) => () => void;
  onTorrentsNotice: (listener: (notice: { message: string; tone: ToastTone }) => void) => () => void;
  onOpenMagnet: (listener: (magnet: string) => void) => () => void;
  onPermissionRequest: (listener: (request: PermissionPrompt) => void) => () => void;
  respondPermission: (id: string, allow: boolean) => Promise<boolean>;
  defaultBrowserStatus: () => Promise<DefaultBrowserStatus>;
  defaultBrowserSet: () => Promise<DefaultBrowserStatus>;
  openDefaultApps: () => Promise<boolean>;
  takeBrowserUrls: () => Promise<string[]>;
  browserClearTab: (partition: string) => Promise<boolean>;
  popupsList: () => Promise<PopupTabInfo[]>;
  popupsCanvas: (rect: PopupTabRect | null) => void;
  popupsShow: (id: string) => Promise<boolean>;
  popupsHide: (id: string) => Promise<boolean>;
  popupsHideAll: () => Promise<boolean>;
  popupsClose: (id: string) => Promise<boolean>;
  popupsAction: (id: string, action: 'back' | 'forward' | 'reload' | 'stop') => Promise<boolean>;
  onPopupOpened: (listener: (popup: PopupTabInfo) => void) => () => void;
  onPopupChanged: (listener: (popup: PopupTabInfo) => void) => () => void;
  onPopupClosed: (listener: (event: { id: string }) => void) => () => void;
  serviceClearSession: (partition: string) => Promise<boolean>;
  serviceStop: (partition: string) => Promise<number>;
  serviceSetNotifications: (enabled: boolean) => Promise<boolean>;
  serviceSetPolicy: (
    partition: string,
    policy: { notifications: boolean; muted: boolean },
  ) => Promise<boolean>;
  weatherLookup: (city: string, unit: 'c' | 'f') => Promise<WeatherResult>;
  weatherAt: (latitude: number, longitude: number, unit: 'c' | 'f') => Promise<WeatherResult>;
  /** Resolve a public Spotify or YouTube playlist into player queue rows. */
  playlistResolve: (
    url: string,
  ) => Promise<import('../electron/types').PlaylistImportResult>;
  /** Loopback bridge URL for a validated YouTube video id, or null. */
  playerEmbedUrl: (videoId: string, autoplay: boolean) => Promise<string | null>;
  /** Upload a WAV to the configured Whisper server from the main process. */
  lexiumTranscribe: (request: LexiumProxyRequest) => Promise<LexiumProxyResult>;
  /** Ask the same server, from the main process, whether it is up. */
  lexiumProbe: (request: { engine: string; baseUrl: string }) => Promise<LexiumProbeResult>;
  resourcesSample: (
    services: Array<{ id: string; url: string }>,
  ) => Promise<ResourceSnapshot | null>;
  /** Media playing in service guests, plus one remote control per track. */
  mediaList: () => Promise<import('../electron/types').ServiceMediaState[]>;
  mediaControl: (id: number, action: 'play' | 'pause' | 'next' | 'previous') => Promise<boolean>;
  mediaSetVolume: (volume: number) => Promise<number>;
  mediaSetRepeat: (repeat: boolean) => Promise<boolean>;
  /** Opt-in Spotify ad guard; resolves to the state the main process kept. */
  spotifyAdGuard: (enabled: boolean) => Promise<boolean>;
  onMediaChanged: (
    listener: (event: import('../electron/types').ServiceMediaEvent) => void,
  ) => () => void;
  vpnStatus: () => Promise<VpnStatus>;
  vpnConfigure: (settings: unknown) => Promise<VpnStatus>;
  vpnChooseBinary: () => Promise<VpnStatus>;
  vpnChooseConfig: () => Promise<VpnStatus>;
  vpnConnect: () => Promise<VpnStatus>;
  vpnDisconnect: () => Promise<VpnStatus>;
  assistantProbe: (baseUrl: string) => Promise<AssistantProbe>;
  assistantChat: (request: AssistantChatRequest) => Promise<AssistantChatResult>;
  assistantCancel: (requestId: string) => Promise<boolean>;
  onAssistantDelta: (listener: (event: AssistantDelta) => void) => () => void;
  modelStatus: () => Promise<LocalModelStatus>;
  modelChoose: () => Promise<LocalModelStatus>;
  modelChooseBinary: () => Promise<LocalModelStatus>;
  modelStart: () => Promise<LocalModelStatus>;
  modelStop: () => Promise<LocalModelStatus>;
  modelConfigure: (patch: LocalModelPatch) => Promise<LocalModelStatus>;
  modelsCatalogue: () => Promise<ModelCatalogueEntry[]>;
  modelsInstalled: () => Promise<ModelInstalledRow[]>;
  modelsDownload: (id: string) => Promise<ModelDownloadResult>;
  modelsCancel: (id: string) => Promise<boolean>;
  modelsDelete: (id: string) => Promise<ModelDownloadResult>;
  onModelProgress: (listener: (progress: ModelDownloadProgress) => void) => () => void;
  wallpaperLoad: () => Promise<WallpaperImage | null>;
  wallpaperSave: (dataUrl: string) => Promise<WallpaperImage | null>;
  wallpaperClear: () => Promise<boolean>;
  chromiumInfo: () => Promise<EngineInfo | null>;
  chromiumSet: (settings: ChromiumSettings) => Promise<EngineInfo | null>;
  partySources: () => Promise<PartySource[]>;
  partySelectSource: (id: string, audio: boolean) => Promise<boolean>;
  attention: (active: boolean) => void;
  onOpenUrl: (listener: (url: string) => void) => () => void;
  updateStatus: () => Promise<UpdateStatus | null>;
  updateCheck: () => Promise<UpdateStatus | null>;
  updateDownload: () => Promise<UpdateStatus | null>;
  updateInstall: () => Promise<boolean>;
  updateReveal: () => Promise<boolean>;
  updateOpenRelease: () => Promise<boolean>;
  onUpdateChanged: (listener: (status: UpdateStatus) => void) => () => void;
}

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

/** Current conditions for one city; fetched by the main process. */
export interface WeatherNow {
  temperature: number;
  apparent: number;
  code: number;
  wind: number;
  isDay: boolean;
  humidity: number;
}

export interface WeatherResult {
  ok: boolean;
  error?: 'offline' | 'not-found' | 'invalid' | 'unavailable';
  place?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  current?: WeatherNow;
  fetchedAt?: number;
}

/** One OS process as reported by Electron's app metrics. */
export interface ResourceProcess {
  pid: number;
  type: string;
  label: string;
  serviceId?: string;
  cpu: number;
  memoryMB: number;
}

export interface ResourceServiceUsage {
  id: string;
  cpu: number;
  memoryMB: number;
  processes: number;
}

export interface ResourceSnapshot {
  capturedAt: number;
  /** Whole-machine CPU, kept for diagnostics; the panel shows appCpuShare. */
  cpu: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  appCpu: number;
  appCpuShare: number;
  cpuCores: number;
  appMemoryMB: number;
  memoryShare: number;
  gpuCpu: number;
  gpuMemoryMB: number;
  processCount: number;
  processes: ResourceProcess[];
  services: ResourceServiceUsage[];
}

export type VpnPhase = 'idle' | 'connecting' | 'connected' | 'error' | 'missing' | 'stopped';

export interface VpnStatus {
  phase: VpnPhase;
  binaryFound: boolean;
  configFound: boolean;
  /** Paths echoed by the main process after a file dialog. */
  binaryPath: string;
  configPath: string;
  detail: string;
  /** Last lines of the OpenVPN process, credentials never included. */
  log: string;
  since: number | null;
}
