import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

type DownloadState = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';

interface DownloadRecord {
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

interface DownloadResult {
  ok: boolean;
  message: string;
  records: DownloadRecord[];
}

interface DownloadLocation {
  path: string;
  torrentPath: string;
  isDefault: boolean;
}

interface DownloadLocationResult {
  ok: boolean;
  message: string;
  location: DownloadLocation | null;
}

interface DefaultBrowserStatus {
  supported: boolean;
  isDefault: boolean;
  canRegister: boolean;
  detail?: string;
}

type TorrentState = 'metadata' | 'downloading' | 'paused' | 'seeding' | 'error';
type TorrentSource = 'magnet' | 'file';
type MediaPermission = 'microphone' | 'camera';
type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface TorrentFileRecord {
  name: string;
  path: string;
  length: number;
  downloaded: number;
  progress: number;
}

interface TorrentRecord {
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

interface TorrentResult {
  ok: boolean;
  message: string;
  records: TorrentRecord[];
  record?: TorrentRecord;
}

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'current'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

type UpdateMode = 'installed' | 'portable' | 'source';

type UpdateErrorCode =
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

interface UpdateStatus {
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

interface PermissionPrompt {
  id: string;
  origin: string;
  host: string;
  devices: MediaPermission[];
}

/**
 * The only bridge between the sandboxed renderer and the main process. No
 * filesystem, no shell, no arbitrary IPC — a fixed list of typed operations.
 * Extension paths and filter-list URLs never cross this bridge.
 */
const api = {
  platform: process.platform,
  loadState: (): Promise<unknown> => ipcRenderer.invoke('kryvex:state:load'),
  saveState: (state: unknown): Promise<boolean> => ipcRenderer.invoke('kryvex:state:save', state),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('kryvex:open-external', url),
  shieldStatus: (): Promise<unknown> => ipcRenderer.invoke('kryvex:shield:status'),
  shieldSetEnabled: (enabled: boolean): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:shield:enabled', enabled),
  shieldUpdate: (): Promise<unknown> => ipcRenderer.invoke('kryvex:shield:update'),
  shieldSetOption: (option: string, enabled: boolean): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:shield:option', option, enabled),
  extensionsList: (): Promise<unknown> => ipcRenderer.invoke('kryvex:extensions:list'),
  extensionsInstall: (): Promise<unknown> => ipcRenderer.invoke('kryvex:extensions:install'),
  extensionsInstallFolder: (): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:extensions:install-folder'),
  extensionsInstallWebStore: (extensionId: string): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:extensions:webstore', extensionId),
  extensionsSetEnabled: (key: string, enabled: boolean): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:extensions:enabled', key, enabled),
  extensionsRemove: (key: string): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:extensions:remove', key),
  downloadsList: (): Promise<DownloadRecord[]> => ipcRenderer.invoke('kryvex:downloads:list'),
  downloadsLocation: (): Promise<DownloadLocation | null> =>
    ipcRenderer.invoke('kryvex:downloads:location'),
  downloadsChooseLocation: (): Promise<DownloadLocationResult> =>
    ipcRenderer.invoke('kryvex:downloads:choose-location'),
  downloadsResetLocation: (): Promise<DownloadLocationResult> =>
    ipcRenderer.invoke('kryvex:downloads:reset-location'),
  downloadsPause: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:downloads:pause', id),
  downloadsCancel: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:downloads:cancel', id),
  downloadsShow: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:downloads:show', id),
  downloadsOpen: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:downloads:open', id),
  downloadsRemove: (id: string, deleteFile: boolean): Promise<DownloadResult> =>
    ipcRenderer.invoke('kryvex:downloads:remove', id, deleteFile),
  downloadsClear: (): Promise<DownloadRecord[]> => ipcRenderer.invoke('kryvex:downloads:clear'),
  onDownloadsChanged: (listener: (records: DownloadRecord[]) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, records: DownloadRecord[]) => listener(records);
    ipcRenderer.on('kryvex:downloads:changed', wrapped);
    return () => ipcRenderer.removeListener('kryvex:downloads:changed', wrapped);
  },
  torrentsList: (): Promise<TorrentRecord[]> => ipcRenderer.invoke('kryvex:torrents:list'),
  torrentsAddMagnet: (magnet: string): Promise<TorrentResult> =>
    ipcRenderer.invoke('kryvex:torrents:add-magnet', magnet),
  torrentsAddFile: (): Promise<TorrentResult> => ipcRenderer.invoke('kryvex:torrents:add-file'),
  torrentsPause: (id: string): Promise<TorrentResult> =>
    ipcRenderer.invoke('kryvex:torrents:pause', id),
  torrentsResume: (id: string): Promise<TorrentResult> =>
    ipcRenderer.invoke('kryvex:torrents:resume', id),
  torrentsShow: (id: string): Promise<boolean> => ipcRenderer.invoke('kryvex:torrents:show', id),
  torrentsRemove: (id: string, deleteData: boolean): Promise<TorrentResult> =>
    ipcRenderer.invoke('kryvex:torrents:remove', id, deleteData),
  onTorrentsChanged: (listener: (records: TorrentRecord[]) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, records: TorrentRecord[]) => listener(records);
    ipcRenderer.on('kryvex:torrents:changed', wrapped);
    return () => ipcRenderer.removeListener('kryvex:torrents:changed', wrapped);
  },
  onTorrentsNotice: (
    listener: (notice: { message: string; tone: ToastTone }) => void,
  ): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, notice: { message: string; tone: ToastTone }) =>
      listener(notice);
    ipcRenderer.on('kryvex:torrents:notice', wrapped);
    return () => ipcRenderer.removeListener('kryvex:torrents:notice', wrapped);
  },
  onOpenMagnet: (listener: (magnet: string) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, magnet: string) => listener(magnet);
    ipcRenderer.on('kryvex:browser:magnet', wrapped);
    return () => ipcRenderer.removeListener('kryvex:browser:magnet', wrapped);
  },
  onPermissionRequest: (listener: (request: PermissionPrompt) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, request: PermissionPrompt) => listener(request);
    ipcRenderer.on('kryvex:permissions:request', wrapped);
    return () => ipcRenderer.removeListener('kryvex:permissions:request', wrapped);
  },
  respondPermission: (id: string, allow: boolean): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:permissions:respond', id, allow),
  defaultBrowserStatus: (): Promise<DefaultBrowserStatus> =>
    ipcRenderer.invoke('kryvex:browser:default-status'),
  defaultBrowserSet: (): Promise<DefaultBrowserStatus> =>
    ipcRenderer.invoke('kryvex:browser:default-set'),
  openDefaultApps: (): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:browser:default-settings'),
  takeBrowserUrls: (): Promise<string[]> => ipcRenderer.invoke('kryvex:browser:pending-urls'),
  browserClearTab: (partition: string): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:browser:clear-tab', partition),
  serviceClearSession: (partition: string): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:services:clear-session', partition),
  serviceSetNotifications: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:services:notifications', enabled),
  assistantProbe: (baseUrl: string): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:assistant:probe', baseUrl),
  assistantChat: (request: unknown): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:assistant:chat', request),
  assistantCancel: (requestId: string): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:assistant:cancel', requestId),
  onAssistantDelta: (listener: (event: unknown) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on('kryvex:assistant:delta', wrapped);
    return () => ipcRenderer.removeListener('kryvex:assistant:delta', wrapped);
  },
  wallpaperLoad: (): Promise<unknown> => ipcRenderer.invoke('kryvex:wallpaper:load'),
  wallpaperSave: (dataUrl: string): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:wallpaper:save', dataUrl),
  wallpaperClear: (): Promise<boolean> => ipcRenderer.invoke('kryvex:wallpaper:clear'),
  attention: (active: boolean): void => ipcRenderer.send('kryvex:attention', active),
  onOpenUrl: (listener: (url: string) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, url: string) => listener(url);
    ipcRenderer.on('kryvex:browser:open-url', wrapped);
    return () => ipcRenderer.removeListener('kryvex:browser:open-url', wrapped);
  },
  updateStatus: (): Promise<UpdateStatus | null> => ipcRenderer.invoke('kryvex:update:status'),
  updateCheck: (): Promise<UpdateStatus | null> => ipcRenderer.invoke('kryvex:update:check'),
  updateDownload: (): Promise<UpdateStatus | null> => ipcRenderer.invoke('kryvex:update:download'),
  updateInstall: (): Promise<boolean> => ipcRenderer.invoke('kryvex:update:install'),
  updateReveal: (): Promise<boolean> => ipcRenderer.invoke('kryvex:update:reveal'),
  updateOpenRelease: (): Promise<boolean> => ipcRenderer.invoke('kryvex:update:release-page'),
  onUpdateChanged: (listener: (status: UpdateStatus) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, status: UpdateStatus) => listener(status);
    ipcRenderer.on('kryvex:update:changed', wrapped);
    return () => ipcRenderer.removeListener('kryvex:update:changed', wrapped);
  },
  partySources: (): Promise<unknown> => ipcRenderer.invoke('kryvex:party:sources'),
  partySelectSource: (id: string, audio: boolean): Promise<boolean> =>
    ipcRenderer.invoke('kryvex:party:select', id, audio),
  chromiumInfo: (): Promise<unknown> => ipcRenderer.invoke('kryvex:chromium:info'),
  chromiumSet: (settings: unknown): Promise<unknown> =>
    ipcRenderer.invoke('kryvex:chromium:set', settings),
  appInfo: (): Promise<{
    version: string;
    platform: string;
    electron: string;
    chrome: string;
    node: string;
    packaged: boolean;
  }> => ipcRenderer.invoke('kryvex:app:info'),
};

contextBridge.exposeInMainWorld('kryvex', api);

export type KryvexBridge = typeof api;
