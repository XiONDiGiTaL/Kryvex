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

export interface KryvexBridge {
  platform: string;
  loadState: () => Promise<unknown>;
  saveState: (state: unknown) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  appInfo: () => Promise<AppInfo>;
}

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}
