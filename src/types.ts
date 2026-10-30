import type {
  BrandIconKey
} from './lib/brand-icons';
// The engine profile is a contract with the main process: one type, one
// sanitizer, defined next to the Electron wiring and shared with the UI.
import type { ChromiumSettings, EngineInfo } from '../electron/chromium-rules';
import type { PopupTabInfo, PopupTabRect } from '../electron/types';
// The file boundary is a contract with the main process too: one set of rules,
// shared with the tools that transform the bytes on this side.
import type {
  FileKind,
  FileKitCode,
  FilePickResult,
  FileRenameResult,
  FileSaveResult,
  PickedFile,
  WrittenFile,
} from '../electron/file-kit-rules';
export type {
  FileKind,
  FileKitCode,
  FilePickResult,
  FileRenameResult,
  FileSaveResult,
  PickedFile,
  WrittenFile,
};
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
  | 'workspace'
  | 'assistant'
  | 'rooms'
  | 'settings'
  | 'emulator'
  | 'lexium'
  | 'player'
  | 'disk'
  | 'link'
  | 'arcade'
  | 'forge'
  | 'canvas';

export type ServiceCategory =
  | 'communication'
  | 'productivity'
  | 'development'
  | 'ai'
  | 'resources'
  | 'media'
  | 'news'
  | 'education'
  | 'career'
  | 'finance'
  | 'language'
  | 'design'
  | 'music'
  | 'utilities'
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

/**
 * Kryvex's own tools: the built-in services that are not web modules. They
 * cannot be installed, renamed or removed, but they can be pinned to the same
 * rail as installed services.
 */
export type SecretToolId =
  | 'lexium'
  | 'player'
  | 'emulator'
  | 'disk'
  | 'link'
  | 'arcade'
  | 'forge'
  | 'canvas';

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
  /**
   * A second copy of this site may be added on purpose.
   *
   * Every service keeps its own partition, so two copies hold two independent
   * sign-ins. Off by default: adding a site that is already installed reuses
   * the record instead, because one page with two sidebar entries is two places
   * to look for the same service. Set on either record to allow the copy.
   */
  multipleInstances?: boolean;
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

/**
 * Whether Windows starts Kryvex at sign-in. Only booleans cross the bridge: the
 * sentence a person reads is written in the renderer, so it is translated.
 */
export type StartupStatus = import('../electron/types').StartupStatus;

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
export const LANGUAGE_SETTINGS = ['system', 'en', 'es', 'de', 'fr', 'tr'] as const;
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

/**
 * How a service window arrives and leaves the Workspace.
 *
 * `subtle` is a short fade with a small rise, `bouncy` zooms the window in with
 * a slight overshoot (the macOS-minimise feel), and `none` paints it instantly
 * for anyone who finds motion distracting.
 */
export type WindowMotion = 'none' | 'subtle' | 'bouncy';

/** Workspace window behaviour: the animation and how fast it plays. */
export interface WorkspaceSettings {
  motion: WindowMotion;
  /** Speed multiplier for the animation: 1 is the designed duration. */
  motionSpeed: number;
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
  /** The URL the artifact is fetched from; the card names its host from this. */
  sourceUrl?: string;
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

export interface AssistantToolEvent {
  phase: 'start' | 'done';
  name: 'search' | 'fetch';
  /** The query or URL the tool is working on. */
  detail: string;
  count?: number;
  failed?: boolean;
}

export interface AssistantDelta {
  requestId: string;
  delta?: string;
  done?: boolean;
  error?: string;
  /** A live tool step, so a lookup is visible while it runs. */
  tool?: AssistantToolEvent;
  /** What the tools actually returned, for the panel's own links. */
  sources?: Array<{ title: string; url: string }>;
}

export interface AssistantChatRequest {
  requestId: string;
  baseUrl: string;
  model: string;
  messages: AssistantMessage[];
  /** One verified line from Kryvex's own tools, when one answered. */
  facts?: string;
  /** Let the main process look things up before the answer streams. */
  tools?: boolean;
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
  /**
   * When a glass was last logged, in epoch milliseconds. The water nudge reads
   * this to stay quiet after the user drinks, instead of repeating the same
   * reminder the moment they have acted on it.
   */
  waterAt?: number;
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
  | 'guide'
  | 'capture'
  | 'countdown'
  | 'clock';
export type HomeWidgetArea = 'main' | 'side';

/**
 * The Home view's own blocks, in the order a reader can rearrange them: the
 * common actions, the quick launcher, the recent list and the startup summary.
 */
export type HomeSectionId = 'actions' | 'launch' | 'recent' | 'startup';

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
  showCapture: boolean;
  showCountdown: boolean;
  showClock: boolean;
  /** Last currency pair chosen, kept as three-letter ISO codes. */
  currencyFrom: string;
  currencyTo: string;
  /** Position of every widget, across both columns. */
  widgetOrder: HomeWidgetId[];
  /** Which column each widget occupies. */
  widgetAreas: Record<HomeWidgetId, HomeWidgetArea>;
  /** The order of the Home view's blocks, top to bottom. */
  sectionOrder: HomeSectionId[];
  wellness: WellnessSettings;
  city: string;
  /** Country or region label returned by geocoding, for the city chip. */
  place: string;
  latitude: number | null;
  longitude: number | null;
  unit: 'c' | 'f';
  notes: HomeNote[];
  /** Milestones, soonest first. */
  countdowns: HomeCountdown[];
  /** Up to four places; an empty list shows this machine and UTC. */
  worldClocks: WorldClockCity[];
  /** 12-hour main clock when true, 24-hour when false. */
  clockHour12: boolean;
  /**
   * The world clock's own format. It is a separate field on purpose: a board
   * clock read at a glance and a list of cities a person compares are two
   * readers, and changing one must not change the other.
   */
  worldClockHour12: boolean;
  /** The board's own clock, the first thing the board draws. */
  showBoardClock: boolean;
  /** How that clock is laid out: no box, a card, or tracked mono. */
  clockStyle: ClockStyle;
  /** Which theme colour the time itself is drawn in. */
  clockAccent: ClockAccent;
  /** Family for the time only; the rest of the board keeps the UI font. */
  clockFont: TypographyFont;
  /** Size of the board clock as a percentage of its design size, 70-180. */
  clockScale: number;
  /** Left, centred or right inside the board's main column. */
  clockAlign: ClockAlign;
  /** Recent screen captures, newest first. Files live where the user saved them. */
  screenCaptures: ScreenCapture[];
  /** The in-house board guide opens once; it stays available afterwards. */
  guideSeen: boolean;
}

/** One item from the quick-capture box: a task, a link or an idea. */
/**
 * One clock on the Home board.
 *
 * The city is the label and the IANA zone is what actually tells the time, so
 * `İzmir` can be listed as itself instead of as the wider region name its zone
 * happens to carry. Coordinates are kept when the city was looked up, so the row
 * can be reopened or re-checked without asking the network again.
 */
export interface WorldClockCity {
  id: string;
  zone: string;
  city: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

/** A still or a recording the user kept, and where it went on this machine. */
export interface ScreenCapture {
  id: string;
  kind: 'shot' | 'clip';
  /** File name only, so a moved folder does not leave a stale absolute path. */
  name: string;
  /** Absolute path when the desktop saved it; empty for a browser download. */
  path: string;
  bytes: number;
  width: number;
  height: number;
  /** The service or window it came from, for the row label. */
  target: string;
  createdAt: number;
}

export type CaptureKind = 'shot' | 'clip';

/** A date-only or exact-time milestone on the Home board. */
export interface HomeCountdown {
  id: string;
  label: string;
  /** Local epoch milliseconds of the target. */
  target: number;
  /** True when only a date was given, so the hour is not shown. */
  allDay: boolean;
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
  | 'vb'
  | 'n64'
  | 'psx'
  /** Second engine only: hidden unless the experimental Flycast build is on. */
  | 'dreamcast';

export interface EmulatorSettings {
  system: EmulatorSystem;
  scale: number;
  gamepad: boolean;
  /** Keep the CRT scanline treatment over the canvas. */
  crt: boolean;
  /**
   * The second engine (Dreamcast) is switched on.
   *
   * Off by default: while it is off the cartridge engine behaves exactly as it
   * always has, its formats are the only ones offered, and nothing is
   * downloaded. Turning it on reveals the system and the engine panel; the
   * release itself is installed from there, one file at a time.
   */
  experimentalEngine: boolean;
}

/**
 * Where speech-to-text comes from.
 *
 * `windows-speech` is the engine Windows already ships: it is run from the main
 * process, needs no download and no server, and is the default on the desktop
 * build. The other three are HTTP servers the user starts, for better accuracy.
 */
export type LexiumEngine = 'windows-speech' | 'local-whisper' | 'whisper-cpp' | 'openai';

/**
 * The Whisper server Kryvex can install for Lexium. The shapes live in the main
 * process (they describe what it actually wrote to disk and started), so they
 * are re-exported here rather than restated for the renderer.
 */
export type SpeechRuntimeStatus = import('../electron/types').SpeechRuntimeStatus;
export type SpeechInstallProgress = import('../electron/types').SpeechInstallProgress;
export type SpeechFailure = import('../electron/types').SpeechFailure;
export type SpeechModelEntry = import('../electron/types').SpeechModelEntry;

/** The optional second emulator engine, as the main process describes it. */
export type FlycastStatus = import('../electron/types').FlycastStatus;
export type FlycastProgress = import('../electron/types').FlycastProgress;
export type FlycastPayload = import('../electron/types').FlycastPayload;
export type FlycastPayloadResult = import('../electron/types').FlycastPayloadResult;

/** The netplay sidecar: the RetroArch the user installed, driven by Kryvex. */
export type RetroarchStatus = import('../electron/types').RetroarchStatus;
export type RetroarchPhase = import('../electron/types').RetroarchPhase;
export type RetroarchFailure = import('../electron/types').RetroarchFailure;
export type RetroarchCoreState = import('../electron/types').RetroarchCoreState;
export type RetroarchSession = import('../electron/types').RetroarchSession;
export type RetroarchStartInput = import('../electron/types').RetroarchStartInput;

/** The emulator's picked folders: what is listed, and one file's bytes. */
export type EmulatorLibraryListing = import('../electron/types').EmulatorLibraryListing;
export type EmulatorLibraryRead = import('../electron/types').EmulatorLibraryRead;
export type EmulatorLibraryFile = import('../electron/types').EmulatorLibraryFile;

/** Lexium: the in-house translator, transcriber and OCR reader. */
export interface LexiumSettings {
  /** Which speech-to-text server the Transcribe tab talks to. */
  engine: LexiumEngine;
  /** Loopback (or LAN) base URL of that server; nothing is sent to Kryvex. */
  baseUrl: string;
  /** Model name for local-whisper/OpenAI-compatible servers; whisper.cpp picks its model at launch. */
  model: string;
  /**
   * Set once the engine has been decided, so a profile still on the untouched
   * default moves to the PC speech engine exactly once and a later choice of a
   * Whisper server is never migrated again.
   */
  migrated?: boolean;
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

export type TypographyFont =
  | 'default'
  | 'system'
  | 'humanist'
  | 'serif'
  | 'mono'
  | 'display'
  | 'slab';

/**
 * The board clock's looks: free on the board, a bordered card, the tracked
 * monospace reading of a clock radio, a stroked outline and a serif editorial
 * line. Variety by choice, not one taste.
 */
export type ClockStyle = 'bare' | 'card' | 'mono' | 'outline' | 'classic';

/** Which theme colour the time is drawn in. */
export type ClockAccent = 'theme' | 'accent' | 'muted';

/**
 * Where the clock sits in its column. Left is the board's own rhythm; centred is
 * the clean dashboard look; right mirrors it beside the board tools.
 */
export type ClockAlign = 'left' | 'center' | 'right';

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
  /**
   * The built-in tools are opt-in on first use: a profile that has never
   * opened one is asked once, and the answer is kept. A profile that already
   * pins a tool counts as having answered yes.
   */
  secretServices: boolean;
  /** Background image laid behind the workspace. */
  wallpaper: WallpaperSettings;
  /** How service windows open, close and minimise on the Workspace. */
  workspace: WorkspaceSettings;
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
  /** Kryvex Link: the phone companion served on this machine's network. */
  link: LinkSettings;
  /**
   * Built-in tools pinned beside services in the sidebar rail, in the order
   * they were pinned. Unknown or duplicate entries are dropped on load.
   */
  pinnedTools: SecretToolId[];
  /** What happens to a service after the user navigates away from it. */
  lifecycle: LifecycleSettings;
  /** Global text size and family for the Kryvex interface. */
  typography: TypographySettings;
}

export interface DiskSettings {
  /** 0 until the user accepts the cleanup disclaimer. */
  disclaimerAcceptedAt: number;
}

/**
 * Kryvex Link is off until it is started on its own page: it opens a socket the
 * rest of the local network can reach, so it is never a default.
 */
export interface LinkSettings {
  enabled: boolean;
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
  error?: 'offline' | 'invalid' | 'unsupported';
  status?: number;
  /**
   * Why an engine is not ready, or which recognisers the PC speech engine has.
   * One field, two engines: an address reports its message, the in-box engine
   * reports its reason code.
   */
  detail?: string;
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

/**
 * Kryvex Link's state as the shell sees it. The types live here rather than
 * being imported from the Electron tree, because the renderer is built without
 * it; the main process keeps the token out of this shape on purpose.
 */
export interface LinkStatusView {
  enabled: boolean;
  running: boolean;
  port: number;
  code: string;
  codeExpiresAt: number;
  urls: string[];
  /** `urls` with the adapter each address belongs to, for the phone setup card. */
  links?: Array<{ url: string; address: string; name: string; likely: boolean }>;
  folder: string;
  devices: Array<{
    /** Public handle for unpairing; not the device's token. */
    id: string;
    label: string;
    address: string;
    pairedAt: number;
    lastSeenAt: number;
  }>;
  received: Array<{ id: string; name: string; size: number; at: number }>;
  offered: Array<{ id: string; name: string; size: number; at: number }>;
  error?: string;
}

/**
 * The overlay-network family a tunnel adapter belongs to, as the shell sees it.
 * The renderer is built without the Electron tree, so the list is repeated
 * here; the two only ever disagree if one is edited alone.
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
export interface VlanAdapterView {
  name: string;
  address: string;
  engine: VlanEngine;
}

/** What Kryvex can honestly report about virtual LANs: the user's own adapters. */
export interface VlanStatusView {
  adapters: VlanAdapterView[];
  detail: string;
}

/** A toast the main process asks the shell to show on the link's behalf. */
export interface LinkNotice {
  message: string;
  tone: ToastTone;
}

/** What a paired phone can ask the shell to do. */
export type LinkCommandEvent =
  | { command: 'open-url'; url: string }
  | { command: 'rooms' | 'home' };

export interface KryvexBridge {
  platform: string;
  /**
   * The file boundary behind File Forge and Canvas.
   *
   * The renderer transforms bytes; these four calls are the only way a file is
   * read, written or renamed, and each one goes through a native dialog in the
   * main process. Nothing crosses with a bare path from this side.
   */
  filesPick: (request: { kind: FileKind; multiple?: boolean }) => Promise<FilePickResult>;
  filesSave: (request: { items: { name: string; data: string }[] }) => Promise<FileSaveResult>;
  filesRename: (request: {
    items: { path: string; name: string }[];
  }) => Promise<FileRenameResult>;
  filesReveal: (filePath: string) => Promise<boolean>;
  filesCopyText: (text: string) => Promise<boolean>;
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
  /** Whether Windows starts Kryvex at sign-in; read from the Run entry itself. */
  startupStatus: () => Promise<StartupStatus>;
  startupSet: (enabled: boolean) => Promise<StartupStatus>;
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
  // Kryvex Link. The status the view reads carries device handles, never tokens:
  // the shell can ask the main process to unpair, not to impersonate a phone.
  linkStatus: () => Promise<LinkStatusView | null>;
  linkConfigure: (patch: { enabled?: boolean }) => Promise<LinkStatusView | null>;
  linkNewCode: () => Promise<LinkStatusView | null>;
  linkRevoke: (id: string) => Promise<boolean>;
  linkRevokeAll: () => Promise<boolean>;
  linkOffer: () => Promise<LinkStatusView | null>;
  linkRemove: (id: string, deleteFile: boolean) => Promise<LinkStatusView | null>;
  linkClear: (deleteFiles: boolean) => Promise<LinkStatusView | null>;
  linkReveal: (id: string) => Promise<boolean>;
  linkOpen: (id: string) => Promise<boolean>;
  linkNotify: (title: string, body: string) => Promise<boolean>;
  onLinkNotice: (listener: (notice: LinkNotice) => void) => () => void;
  onLinkCommand: (listener: (event: LinkCommandEvent) => void) => () => void;
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
  /**
   * The local Whisper server Lexium can install and run on this machine.
   * `null` comes back from an untrusted sender, which the panel treats as
   * "not available here" rather than as a failure.
   */
  speechStatus: () => Promise<import('../electron/types').SpeechRuntimeStatus | null>;
  speechInstall: (
    model: string,
  ) => Promise<import('../electron/types').SpeechRuntimeStatus | null>;
  speechStart: (
    model: string,
  ) => Promise<import('../electron/types').SpeechRuntimeStatus | null>;
  speechStop: () => Promise<import('../electron/types').SpeechRuntimeStatus | null>;
  speechRemove: (
    model: string,
  ) => Promise<import('../electron/types').SpeechRuntimeStatus | null>;
  /** Stops a download in flight; the partial file is removed with it. */
  speechCancel: () => Promise<boolean>;
  /**
   * Start the local engine with Kryvex, and stop it on quit. Enabling also
   * starts it now; disabling stops it, so the switch never lies about what is
   * running.
   */
  speechAutostart: (
    enabled: boolean,
  ) => Promise<import('../electron/types').SpeechRuntimeStatus | null>;
  onSpeechProgress: (
    listener: (event: import('../electron/types').SpeechInstallProgress) => void,
  ) => () => void;
  /**
   * The optional second emulator engine: a pinned Flycast build the main
   * process fetches, verifies and keeps. `null` comes back from an untrusted
   * sender or the web build, which the panel reads as "not available here".
   */
  flycastStatus: () => Promise<import('../electron/types').FlycastStatus | null>;
  flycastInstall: () => Promise<import('../electron/types').FlycastStatus | null>;
  /**
   * The verified core files, as bytes. Re-hashed on the way out, so a file
   * changed on disk is refused instead of handed to a code loader.
   */
  flycastCore: () => Promise<import('../electron/types').FlycastPayloadResult | null>;
  flycastRemove: () => Promise<import('../electron/types').FlycastStatus | null>;
  /** Stops a download in flight; the partial files are removed with it. */
  flycastCancel: () => Promise<boolean>;
  onFlycastProgress: (
    listener: (event: import('../electron/types').FlycastProgress) => void,
  ) => () => void;
  /**
   * Real netplay through the RetroArch the user installed themselves. Kryvex
   * never ships or downloads it; `null` comes back from the web build or an
   * untrusted sender, which the panel reads as "not available here".
   */
  retroarchStatus: () => Promise<import('../electron/types').RetroarchStatus | null>;
  /** Opens the main process's own file dialog; a path never crosses the bridge. */
  retroarchLocate: () => Promise<import('../electron/types').RetroarchStatus | null>;
  retroarchForget: () => Promise<import('../electron/types').RetroarchStatus | null>;
  retroarchStart: (
    input: import('../electron/types').RetroarchStartInput,
  ) => Promise<import('../electron/types').RetroarchStatus | null>;
  retroarchStop: () => Promise<import('../electron/types').RetroarchStatus | null>;
  /**
   * The emulator's cartridge and BIOS folders.
   *
   * A folder is remembered in the main process after a native dialog; the
   * renderer sees file names and sizes, and reads one back by path only through
   * `emulatorReadFile`, which refuses anything outside a folder that was picked.
   * The web build has none of these, which the panel reads as "desktop only".
   */
  emulatorFolder: (
    kind: 'roms' | 'bios',
  ) => Promise<import('../electron/types').EmulatorLibraryListing | null>;
  emulatorPickFolder: (
    kind: 'roms' | 'bios',
  ) => Promise<import('../electron/types').EmulatorLibraryListing | null>;
  emulatorReadFile: (
    path: string,
  ) => Promise<import('../electron/types').EmulatorLibraryRead | null>;
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
  /** Tunnel addresses this machine already has; read-only, nothing is created. */
  vlanStatus: () => Promise<VlanStatusView>;
  /** Write a capture the renderer produced, after the user picks a folder. */
  captureSave: (request: {
    data: string;
    name: string;
    kind: CaptureKind;
  }) => Promise<CaptureSaveResult>;
  /** Put a PNG capture on the system clipboard. */
  captureCopy: (data: string) => Promise<boolean>;
  /** Reveal a saved capture in Explorer. */
  captureReveal: (path: string) => Promise<boolean>;
  /** Show a fresh capture in its own preview window, like a snipping tool. */
  capturePreview: (request: {
    data: string;
    name: string;
    kind: CaptureKind;
    width: number;
    height: number;
    target: string;
    language: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  /** The preview window asked for another capture; the board should answer. */
  onCaptureAsk: (listener: () => void) => () => void;
  /** A save taken in the preview window, for the board's recent list. */
  onCaptureSaved: (
    listener: (entry: {
      kind: CaptureKind;
      name: string;
      path: string;
      bytes: number;
      width: number;
      height: number;
      target: string;
    }) => void,
  ) => () => void;
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

export interface CaptureSaveResult {
  ok: boolean;
  /** Set when the file was written. */
  path?: string;
  /** True when the user closed the save dialog. */
  cancelled?: boolean;
  message?: string;
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
