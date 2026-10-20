import type { BrandIconKey } from './lib/brand-icons';
// The engine profile is a contract with the main process: one type, one
// sanitizer, defined next to the Electron wiring and shared with the UI.
import type { ChromiumSettings, EngineInfo } from '../electron/chromium-rules';
export type {
  ChromiumColorScheme,
  ChromiumSettings,
  EngineGuest,
  EngineInfo,
} from '../electron/chromium-rules';

export type ViewId = 'home' | 'services' | 'browser' | 'assistant' | 'rooms' | 'settings';

export type ServiceCategory =
  | 'communication'
  | 'productivity'
  | 'development'
  | 'ai'
  | 'resources'
  | 'media'
  | 'other';

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
export type SearchEngine = 'duckduckgo' | 'google' | 'bing';
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
}

export type LocalModelPhase = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

/** A GGUF file the user chose, plus the llama.cpp server serving it. */
export interface LocalModelStatus {
  phase: LocalModelPhase;
  path: string;
  name: string;
  baseUrl: string;
  port: number | null;
  binary: string;
  binaryFound: boolean;
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
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
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
  serviceClearSession: (partition: string) => Promise<boolean>;
  serviceSetNotifications: (enabled: boolean) => Promise<boolean>;
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
