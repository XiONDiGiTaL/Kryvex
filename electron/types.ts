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
  /** Rules that would compile now, after the privilege filter. */
  customRules: number;
  /** Privileged rules dropped because scriptlets are switched off. */
  customSkipped: number;
  customLines: number;
  customLimit: number;
  /** Curated YouTube ad/feed bundle. */
  youtube: boolean;
  httpsUpgrades: number;
  paramsStripped: number;
  error?: string;
}

export type LocalModelPhase = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

/** A GGUF file the user chose, plus the llama.cpp server serving it. */
export interface LocalModelStatus {
  phase: LocalModelPhase;
  path: string;
  /** Display name: the file name without `.gguf`. */
  name: string;
  /** Loopback origin while the server runs; empty otherwise. */
  baseUrl: string;
  port: number | null;
  binary: string;
  binaryFound: boolean;
  pid: number | null;
  startedAt: number | null;
  ctxSize: number;
  gpuLayers: number;
  /** Tail of the runtime's output, for the error panel. */
  log: string;
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

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';
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

/** A capture target listed for the Rooms picker. */
export interface PartySource {
  id: string;
  kind: 'screen' | 'window' | 'app';
  name: string;
  detail?: string;
  thumbnail?: string;
}

export interface DefaultBrowserStatus {
  supported: boolean;
  isDefault: boolean;
  canRegister: boolean;
  detail?: string;
}
