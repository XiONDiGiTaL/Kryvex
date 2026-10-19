import { app, ipcMain, net, type Session } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ShieldStatus } from './types';

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
] as const;

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
}

const DEFAULT_CONFIG: ShieldConfig = {
  enabled: true,
  autoUpdate: true,
  updatedAt: null,
  filterCount: 0,
  lists: [],
};

function configPath(): string {
  return path.join(app.getPath('userData'), 'kryvex-shield.json');
}

function enginePath(): string {
  return path.join(app.getPath('userData'), 'kryvex-shield-engine.bin');
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
      ...(this.error ? { error: this.error } : {}),
    };
  }

  init(): void {
    this.config = readConfig();
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
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;
    const stale =
      !this.config.updatedAt || Date.now() - this.config.updatedAt > REFRESH_AFTER_MS;
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
      }
      registeredCosmeticChannels.clear();
      return this.status();
    }
    if (this.blocker) {
      for (const ses of this.sessions) this.attach(ses);
    } else {
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
      const filters = texts.join('\n\n');
      const next = ElectronBlocker.parse(filters);
      // Detach the previous engine before swapping listeners.
      for (const ses of this.sessions) {
        try {
          this.blocker?.disableBlockingInSession(ses);
        } catch {
          /* ignore */
        }
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
      this.config.updatedAt = Date.now();
      this.config.lists = LIST_SOURCES.map(source => source.label);
      this.config.filterCount = this.countFilters();
      writeConfig(this.config);
      this.phase = 'ready';
      for (const ses of this.sessions) this.attach(ses);
      return this.status();
    } catch (error) {
      this.phase = this.blocker ? 'ready' : 'error';
      this.error = error instanceof Error ? error.message : String(error);
      return this.status();
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
      if (this.blocker.isBlockingEnabled(ses)) return;
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
    } catch (error) {
      this.error = `Could not attach to a session: ${String(error)}`;
    }
  }
}

export const shield = new Shield();
