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

/** What one service guest is playing, as its own Media Session reports it. */
export interface ServiceMediaState {
  /** Electron webContents id; the only handle the shell can control. */
  id: number;
  /** The persistent service partition that owns the page. */
  partition: string;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  playing: boolean;
  position: number;
  duration: number;
  updatedAt: number;
}

/** A guest was closed or navigated away: remove its row from the dock. */
export type ServiceMediaEvent =
  | ({ removed: false } & ServiceMediaState)
  | { removed: true; id: number; partition: string };

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
  /** True when the executable came from the installer or a source checkout. */
  bundled: boolean;
  /** llama.cpp release tag of the bundled runtime, e.g. `b11835`; empty if none. */
  runtimeVersion: string;
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

/**
 * The overlay-network families whose adapter Kryvex can name.
 *
 * `generic` is any tunnel it recognised but cannot attribute to a product, so
 * the panel can still say "a tunnel" rather than guessing a brand.
 */
export type VlanEngine =
  | 'zerotier'
  | 'easytier'
  | 'tailscale'
  | 'wireguard'
  | 'openvpn'
  | 'hamachi'
  | 'nebula'
  | 'n2n'
  | 'generic';

/** One tunnel adapter this machine already has, with its virtual address. */
export interface VlanAdapter {
  name: string;
  address: string;
  engine: VlanEngine;
}

/**
 * What the main process can honestly say about virtual LANs here: the adapters
 * the user's own engine has already created. Kryvex creates none, routes none
 * and admits nobody; an empty list means no overlay network is running.
 */
export interface VlanStatus {
  adapters: VlanAdapter[];
  detail: string;
}

/** One in-app popup tab: a real popup window the shell places over the canvas. */
export interface PopupTabInfo {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

/** The browser canvas rectangle, reported by the renderer in CSS pixels. */
export interface PopupTabRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DefaultBrowserStatus {
  supported: boolean;
  isDefault: boolean;
  canRegister: boolean;
  detail?: string;
}

/**
 * Whether Windows starts Kryvex at sign-in.
 *
 * Only booleans: the sentence a person reads is written in the renderer, so it
 * is translated like the rest of the interface.
 */
export interface StartupStatus {
  /** Windows is the only platform this is implemented for. */
  supported: boolean;
  /** The Run entry exists right now. */
  enabled: boolean;
  /** The entry would open Kryvex, so it may be written. */
  canChange: boolean;
}

/**
 * One row resolved from a public Spotify or YouTube playlist. `url` is the
 * media the player can actually decode: a Spotify preview MP3, or the watch
 * page that feeds the sandboxed YouTube embed.
 */
export interface PlaylistImportTrack {
  title: string;
  artist: string;
  /**
   * The 30-second preview for a Spotify row, or the watch page for a YouTube
   * one. Empty when the provider no longer serves a preview for that track: the
   * row is still listed, because hiding it would hide most of a modern playlist.
   */
  url: string;
  externalUrl: string;
  durationMs: number;
  platform: 'spotify' | 'youtube';
  sourceId: string;
  /** Cover art the provider published, already restricted to its own CDN. */
  art?: string;
}

/** Playlist resolution runs in the main process; no page HTML reaches the shell. */
export interface PlaylistImportResult {
  ok: boolean;
  error?:
    | 'unsupported'
    | 'not-found'
    | 'unavailable'
    | 'offline'
    | 'empty'
    | 'too-large'
    /** The provider answered 403 or 429: this network is being refused. */
    | 'blocked';
  title?: string;
  provider?: 'spotify' | 'youtube';
  tracks?: PlaylistImportTrack[];
  skipped?: number;
  truncated?: boolean;
}

/**
 * One phone paired with Kryvex Link. The token never crosses to the shell: the
 * shell revokes by `id`, a hash of the token that cannot be replayed.
 */
export interface LinkDeviceInfo {
  id: string;
  label: string;
  address: string;
  pairedAt: number;
  lastSeenAt: number;
}

/** Everything the phone may know about a file: never a path on this machine. */
export interface LinkFileInfo {
  id: string;
  name: string;
  size: number;
  at: number;
}

/** The link's state for the Kryvex view: addresses, code, devices, transfers. */
export interface LinkStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  /** The live pairing code, empty until the server starts. */
  code: string;
  codeExpiresAt: number;
  /** Loopback-free URLs, LAN first; the first is the one to type on the phone. */
  urls: string[];
  /** The same addresses with their adapter names and a reachability hint. */
  links: Array<{ url: string; address: string; name: string; likely: boolean }>;
  /** Where received files land. */
  folder: string;
  devices: LinkDeviceInfo[];
  received: LinkFileInfo[];
  offered: LinkFileInfo[];
  error?: string;
}

/** A toast the main process asks the shell to show on the link's behalf. */
export interface LinkNotice {
  message: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

/** What a paired phone can ask the shell to do. */
export type LinkCommandEvent =
  | { command: 'open-url'; url: string }
  | { command: 'rooms' | 'home' };

/**
 * One answer from the main-process Whisper proxy. `payload` is the server's own
 * JSON, parsed in the renderer by the same parser a direct request would use.
 */
export interface LexiumProxyResult {
  ok: boolean;
  /**
   * `unsupported` is the in-box speech engine on a platform that has none: it
   * is not a network failure, and the interface must not describe it as one.
   */
  error?: 'offline' | 'http' | 'invalid' | 'unsupported';
  status?: number;
  /** The server's own message, trimmed, when it replied with an error. */
  detail?: string;
  payload?: unknown;
}

/**
 * The local Whisper server Kryvex can install and run for Lexium.
 *
 * These are the main process's own types; the renderer reads them through the
 * bridge so both sides describe the same status without re-declaring it.
 */
export type SpeechRuntimeStatus = import('./speech-runtime').SpeechRuntimeStatus;
export type SpeechInstallProgress = import('./speech-runtime').SpeechInstallProgress;
export type SpeechFailure = import('./speech-runtime').SpeechFailure;
export type SpeechModelEntry = import('./speech-runtime-rules').SpeechModelEntry;

