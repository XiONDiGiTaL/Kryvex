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

export type Density = 'comfortable' | 'compact';
export type SearchEngine = 'duckduckgo' | 'google' | 'bing';

export interface Settings {
  themeId: string;
  density: Density;
  startView: ViewId;
  sidebarCollapsed: boolean;
  showStatusBar: boolean;
  searchEngine: SearchEngine;
  confirmBeforeDelete: boolean;
}

export interface PersistedState {
  version: 1;
  services: Service[];
  bookmarks: Bookmark[];
  settings: Settings;
  recent: string[];
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
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
  appInfo: () => Promise<AppInfo>;
  shieldStatus: () => Promise<ShieldStatus>;
  shieldSetEnabled: (enabled: boolean) => Promise<ShieldStatus>;
  shieldUpdate: () => Promise<ShieldStatus>;
  extensionsList: () => Promise<ExtensionRecord[]>;
  extensionsInstall: () => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
  extensionsInstallFolder: () => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
  extensionsSetEnabled: (
    key: string,
    enabled: boolean,
  ) => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
  extensionsRemove: (key: string) => Promise<{ ok: boolean; message: string; records: ExtensionRecord[] }>;
}

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}
