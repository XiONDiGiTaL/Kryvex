import type { BrandIconKey } from './lib/brand-icons';

export type ViewId = 'home' | 'services' | 'browser' | 'settings';

export type ServiceCategory =
  | 'communication'
  | 'productivity'
  | 'development'
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

export interface Settings {
  themeId: string;
  density: Density;
  startView: ViewId;
  language: LanguageSetting;
  sidebarCollapsed: boolean;
  showStatusBar: boolean;
  searchEngine: SearchEngine;
  confirmBeforeDelete: boolean;
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
  httpsUpgrades: number;
  paramsStripped: number;
  error?: string;
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
  onOpenUrl: (listener: (url: string) => void) => () => void;
}

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}
