import { app, ipcMain, net, type Session, type WebContents } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ShieldStatus } from './types';
import {
  activeCustomLines,
  composeFilterSource,
  customLineCount,
  MAX_CUSTOM_BYTES,
  sanitizeCustomFilters,
  scriptletCode as buildScriptletCode,
  scriptletSource,
  scriptletsFor,
  SHIELD_BUNDLE_VERSION,
  YOUTUBE_FILTERS,
  isYouTubeUrl,
  youtubeAdCode,
} from './shield-rules';
import { webPrivacy, type PrivacyOptions } from './web-privacy';

/**
 * Native network filtering.
 *
 * uBlock Origin's Chrome extension is MV2 and its blocking webRequest layer is
 * inert in Electron 44 (verified against uBO 1.75.0). Instead of shipping a
 * dead extension, Kryvex runs a native Electron filter engine over uBO's own
 * filter lists. No MV3 service worker, no extension permissions, no reliance on
 * the Chrome Web Store.
 */
const LIST_SOURCES = [
  {
    label: 'uBlock filters',
    url: 'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  },
  {
    label: 'uBlock privacy',
    url: 'https://ublockorigin.github.io/uAssets/filters/privacy.txt',
  },
  {
    label: 'uBlock badware',
    url: 'https://ublockorigin.github.io/uAssets/filters/badware.txt',
  },
  { label: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt' },
  { label: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
  {
    label: 'EasyList Cookie',
    url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt',
  },
] as const;

const COOKIE_LIST = 'EasyList Cookie';

const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 45_000;

/**
 * @ghostery/adblocker-electron registers two global ipcMain handlers every
 * time it enables a session. Electron allows only one handler per channel, so
 * the second partition would throw. The handlers are session-independent
 * (cosmetic injection is routed by the sender), hence one registration is
 * enough for every session.
 */
const COSMETIC_CHANNELS = new Set([
  '@ghostery/adblocker/inject-cosmetic-filters',
  '@ghostery/adblocker/is-mutation-observer-enabled',
]);
const registeredCosmeticChannels = new Set<string>();

interface ShieldConfig {
  enabled: boolean;
  autoUpdate: boolean;
  updatedAt: number | null;
  filterCount: number;
  lists: string[];
  httpsUpgrade: boolean;
  stripTracking: boolean;
  fingerprint: boolean;
  /** The user's own uBO-syntax rules, stored verbatim. */
  customFilters: string;
  customEnabled: boolean;
  /** Scriptlet rules (`##+js(...)`) run page code, so they are opt-out. */
  customScriptlets: boolean;
  /** Curated YouTube bundle: ads, sponsored cards, recommendation shelves. */
  youtube: boolean;
  /** Version of the curated bundle compiled into the cached engine. */
  bundleVersion: number;
}

const DEFAULT_CONFIG: ShieldConfig = {
  enabled: true,
  autoUpdate: true,
  updatedAt: null,
  filterCount: 0,
  lists: [],
  httpsUpgrade: true,
  stripTracking: true,
  fingerprint: true,
  customFilters: '',
  customEnabled: true,
  customScriptlets: true,
  youtube: true,
  bundleVersion: 0,
};

function configPath(): string {
  return path.join(app.getPath('userData'), 'kryvex-shield.json');
}

function enginePath(): string {
  return path.join(app.getPath('userData'), 'kryvex-shield-engine.bin');
}

/**
 * The downloaded lists are kept as source, not only as a compiled engine, so
 * editing a custom rule rebuilds in milliseconds instead of re-downloading
 * six lists. Without this file a rebuild would need the network.
 */
function sourcePath(): string {
  return path.join(app.getPath('userData'), 'kryvex-shield-source.txt');
}

function readConfig(): ShieldConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as Partial<ShieldConfig>;
    return {
      enabled: raw.enabled !== false,
      autoUpdate: raw.autoUpdate !== false,
      updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : null,
      filterCount: Number.isFinite(raw.filterCount) ? Number(raw.filterCount) : 0,
      lists: Array.isArray(raw.lists) ? raw.lists.map(String).slice(0, 12) : [],
      httpsUpgrade: raw.httpsUpgrade !== false,
      stripTracking: raw.stripTracking !== false,
      fingerprint: raw.fingerprint !== false,
      customFilters: sanitizeCustomFilters(raw.customFilters),
      customEnabled: raw.customEnabled !== false,
      customScriptlets: raw.customScriptlets !== false,
      youtube: raw.youtube !== false,
      bundleVersion: Number.isFinite(raw.bundleVersion) ? Number(raw.bundleVersion) : 0,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config: ShieldConfig): void {
  const target = configPath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(config), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
  }
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await net.fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

class Shield {
  private blocker: ElectronBlocker | null = null;
  private config: ShieldConfig = { ...DEFAULT_CONFIG };
  private phase: ShieldStatus['phase'] = 'idle';
  private error: string | undefined;
  private blocked = 0;
  private sessions = new Set<Session>();
  private scriptletGuests = new WeakSet<WebContents>();
  private refreshPromise: Promise<ShieldStatus> | null = null;

  status(): ShieldStatus {
    return {
      enabled: this.config.enabled,
      phase: this.phase,
      ready: Boolean(this.blocker),
      blocked: this.blocked,
      filters: this.config.filterCount,
      lists: this.config.lists,
      updatedAt: this.config.updatedAt,
      autoUpdate: this.config.autoUpdate,
      httpsUpgrade: this.config.httpsUpgrade,
      stripTracking: this.config.stripTracking,
      fingerprint: this.config.fingerprint,
      customFilters: this.config.customFilters,
      customEnabled: this.config.customEnabled,
      customScriptlets: this.config.customScriptlets,
      customRules: this.customReport().rules,
      customSkipped: this.customReport().skipped,
      customLines: customLineCount(this.config.customFilters),
      customLimit: MAX_CUSTOM_BYTES,
      youtube: this.config.youtube,
      ...webPrivacy.stats(),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  /** What the custom box would compile right now, without touching the engine. */
  private customReport() {
    const text = this.config.customEnabled ? this.config.customFilters : '';
    return activeCustomLines(text, { scriptlets: this.config.customScriptlets });
  }

  /** Everything the engine parses: downloaded lists, bundle, custom rules. */
  private composeSource(base: string): string {
    return composeFilterSource({
      base,
      custom: this.config.customEnabled ? this.config.customFilters : '',
      youtube: this.config.youtube,
      options: { scriptlets: this.config.customScriptlets },
    });
  }

  /**
   * Saves the custom rules and recompiles from the cached download. A user
   * editing a rule should never wait on six network requests, and an offline
   * machine should keep its own exceptions.
   */
  setCustom(raw: unknown): ShieldStatus {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return this.status();
    const input = raw as Record<string, unknown>;
    if (typeof input.text === 'string') {
      this.config.customFilters = sanitizeCustomFilters(input.text);
    }
    if (typeof input.enabled === 'boolean') this.config.customEnabled = input.enabled;
    if (typeof input.scriptlets === 'boolean') this.config.customScriptlets = input.scriptlets;
    if (typeof input.youtube === 'boolean') this.config.youtube = input.youtube;
    writeConfig(this.config);
    this.error = undefined;
    if (!this.blocker) {
      if (this.config.enabled) void this.refresh().catch(() => undefined);
      return this.status();
    }
    return this.rebuild();
  }

  /** The curated bundle, exposed so the editor can show exactly what it adds. */
  bundleText(): string {
    return YOUTUBE_FILTERS;
  }

  /**
   * Installs the scriptlet hook on a guest page. Cosmetic filters are injected
   * by the ad blocker; scriptlets are Kryvex's own, because the engine has no
   * scriptlet library. Running them here puts them in the page's main world,
   * where site configuration such as `yt.config_` actually lives.
   */
  attachScriptlets(contents: WebContents): void {
    if (this.scriptletGuests.has(contents)) return;
    this.scriptletGuests.add(contents);
    contents.on('dom-ready', () => {
      let url = '';
      try {
        url = contents.getURL();
      } catch {
        return;
      }
      const code = this.scriptletCode(url);
      if (!code) return;
      contents.executeJavaScript(code).catch(() => undefined);
    });
  }

  /**
   * Page code for the scriptlet rules that apply to one URL.
   *
   * @ghostery/adblocker parses `##+js(...)` but ships no scriptlet library, so
   * without this the YouTube popup rules would silently do nothing. The gate
   * matches the editor's trust switch: no scriptlets while it is off.
   */
  scriptletCode(rawUrl: unknown): string {
    if (!this.config.enabled) return '';
    if (typeof rawUrl !== 'string') return '';
    const source = scriptletSource(
      this.config.customEnabled ? this.config.customFilters : '',
      this.config.youtube,
    );
    // User scriptlets obey the trust switch; the curated YouTube client is
    // Kryvex's own code and stays available even when that switch is off.
    const custom = this.config.customScriptlets
      ? buildScriptletCode(scriptletsFor(source, rawUrl))
      : '';
    const youtube = this.config.youtube && isYouTubeUrl(rawUrl) ? youtubeAdCode() : '';
    return [custom, youtube].filter(Boolean).join('\n');
  }

  init(): void {
    this.config = readConfig();
    this.applyPrivacyOptions();
    try {
      if (fs.existsSync(enginePath())) {
        const buffer = fs.readFileSync(enginePath());
        this.blocker = ElectronBlocker.deserialize(new Uint8Array(buffer));
        this.phase = 'ready';
        this.config.filterCount = this.countFilters();
        this.blocked = 0;
        this.blocker.on('request-blocked', () => {
          this.blocked += 1;
        });
      } else {
        this.phase = this.config.enabled ? 'loading' : 'idle';
      }
    } catch (error) {
      this.phase = 'idle';
      this.error = `Cached engine could not be read: ${String(error)}`;
    }
  }

  trackSession(ses: Session): void {
    this.sessions.add(ses);
    if (this.config.enabled && this.blocker) this.attach(ses);
    else webPrivacy.setBlocker(ses, null);
  }

  setOption(option: string, enabled: boolean): ShieldStatus {
    if (option === 'httpsUpgrade') this.config.httpsUpgrade = enabled;
    else if (option === 'stripTracking') this.config.stripTracking = enabled;
    else if (option === 'fingerprint') this.config.fingerprint = enabled;
    else return this.status();
    writeConfig(this.config);
    this.applyPrivacyOptions();
    if (option === 'fingerprint' && enabled) {
      for (const ses of this.sessions) webPrivacy.ensureSession(ses, true);
    }
    return this.status();
  }

  private applyPrivacyOptions(): void {
    const options: PrivacyOptions = {
      httpsUpgrade: this.config.httpsUpgrade,
      stripTracking: this.config.stripTracking,
      fingerprint: this.config.fingerprint,
    };
    webPrivacy.setOptions(options);
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;
    // A new curated bundle must reach an engine that was cached before it. The
    // source text is kept precisely so this rebuild is offline and instant;
    // if that file is missing (an older profile), refresh online instead.
    if (this.blocker && this.config.bundleVersion !== SHIELD_BUNDLE_VERSION) {
      this.rebuild();
      if (this.config.bundleVersion !== SHIELD_BUNDLE_VERSION) {
        await this.refresh().catch(() => undefined);
      }
      return;
    }
    const stale =
      !this.config.updatedAt ||
      Date.now() - this.config.updatedAt > REFRESH_AFTER_MS ||
      !this.config.lists.includes(COOKIE_LIST);
    if (!this.blocker || stale) {
      await this.refresh().catch(() => undefined);
    }
  }

  setEnabled(enabled: boolean): ShieldStatus {
    this.config.enabled = enabled;
    writeConfig(this.config);
    if (!enabled) {
      for (const ses of this.sessions) {
        try {
          this.blocker?.disableBlockingInSession(ses);
        } catch {
          /* a session may already be destroyed */
        }
        webPrivacy.setBlocker(ses, null);
      }
      registeredCosmeticChannels.clear();
      return this.status();
    }
    if (this.blocker) {
      for (const ses of this.sessions) this.attach(ses);
    } else {
      for (const ses of this.sessions) webPrivacy.setBlocker(ses, null);
      void this.refresh().catch(() => undefined);
    }
    return this.status();
  }

  async refresh(): Promise<ShieldStatus> {
    if (this.refreshPromise) return this.refreshPromise;
    this.phase = 'loading';
    this.error = undefined;
    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<ShieldStatus> {
    try {
      const texts = await Promise.all(
        LIST_SOURCES.map(async source => {
          try {
            return await fetchText(source.url);
          } catch (error) {
            throw new Error(`${source.label}: ${error instanceof Error ? error.message : 'download failed'}`);
          }
        }),
      );
      const base = texts.join('\n\n');
      try {
        fs.mkdirSync(path.dirname(sourcePath()), { recursive: true });
        fs.writeFileSync(sourcePath(), base, 'utf8');
      } catch {
        /* a cache that cannot be written only costs a re-download later */
      }
      this.install(base);
      this.config.updatedAt = Date.now();
      this.config.lists = LIST_SOURCES.map(source => source.label);
      writeConfig(this.config);
      this.phase = 'ready';
      return this.status();
    } catch (error) {
      this.phase = this.blocker ? 'ready' : 'error';
      this.error = error instanceof Error ? error.message : String(error);
      return this.status();
    }
  }

  /** Recompiles from the cached download; used after any custom-rule change. */
  private rebuild(): ShieldStatus {
    let base = '';
    try {
      base = fs.readFileSync(sourcePath(), 'utf8');
    } catch {
      this.error = 'Run “Update lists” once before using custom filters.';
      return this.status();
    }
    try {
      this.install(base);
      this.phase = 'ready';
      writeConfig(this.config);
      return this.status();
    } catch (error) {
      this.error = `Custom filters could not be compiled: ${
        error instanceof Error ? error.message : String(error)
      }`;
      return this.status();
    }
  }

  /** Parses one document into a live engine and swaps it in everywhere. */
  private install(base: string): void {
    const source = this.composeSource(base);
    const next = ElectronBlocker.parse(source, { loadExtendedSelectors: true });
    // Detach the previous engine before swapping listeners.
    for (const ses of this.sessions) {
      try {
        this.blocker?.disableBlockingInSession(ses);
      } catch {
        /* ignore */
      }
      webPrivacy.setBlocker(ses, null);
    }
    registeredCosmeticChannels.clear();
    const serialized = next.serialize();
    const target = enginePath();
    const tmp = `${target}.tmp`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, Buffer.from(serialized));
    fs.renameSync(tmp, target);

    this.blocker = next;
    this.blocked = 0;
    next.on('request-blocked', () => {
      this.blocked += 1;
    });
    this.config.bundleVersion = SHIELD_BUNDLE_VERSION;
    this.config.filterCount = this.countFilters();
    if (this.config.enabled) {
      for (const ses of this.sessions) this.attach(ses);
    } else {
      for (const ses of this.sessions) webPrivacy.setBlocker(ses, null);
    }
  }

  private countFilters(): number {
    try {
      return this.blocker?.getFilters().networkFilters.length ?? 0;
    } catch {
      return this.config.filterCount;
    }
  }

  private attach(ses: Session): void {
    if (!this.blocker) return;
    try {
      if (this.blocker.isBlockingEnabled(ses)) {
        webPrivacy.setBlocker(ses, this.blocker);
        return;
      }
      const originalHandle = ipcMain.handle.bind(ipcMain);
      (ipcMain as unknown as { handle: typeof ipcMain.handle }).handle = ((channel, listener) => {
        if (COSMETIC_CHANNELS.has(channel) && registeredCosmeticChannels.has(channel)) {
          return undefined as unknown as void;
        }
        if (COSMETIC_CHANNELS.has(channel)) registeredCosmeticChannels.add(channel);
        return originalHandle(channel, listener);
      }) as typeof ipcMain.handle;
      try {
        this.blocker.enableBlockingInSession(ses);
      } finally {
        (ipcMain as unknown as { handle: typeof ipcMain.handle }).handle = originalHandle;
      }
      // Ghostery installs its own onBeforeRequest handler above. Replace it
      // with the combined listener so URL privacy and network blocking both
      // run; Electron keeps only the most recent handler per event.
      webPrivacy.setBlocker(ses, this.blocker);
    } catch (error) {
      this.error = `Could not attach to a session: ${String(error)}`;
      webPrivacy.setBlocker(ses, null);
    }
  }
}

export const shield = new Shield();
