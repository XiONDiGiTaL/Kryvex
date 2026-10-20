import { app, net, shell, type BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  UPDATE_RELEASES_API,
  UPDATE_RELEASES_PAGE,
  checksumFor,
  isNewer,
  isTrustedAssetUrl,
  parseChecksums,
  parseRelease,
  releaseAssetFor,
  type ReleaseAsset,
  type UpdateRelease,
} from './update-rules';

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

const JSON_TIMEOUT_MS = 20_000;
const CHECKSUM_TIMEOUT_MS = 15_000;
const ASSET_TIMEOUT_MS = 15 * 60_000;
const MAX_ASSET_BYTES = 400 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 20_000;

class UpdateFailure extends Error {
  constructor(readonly code: UpdateErrorCode) {
    super(code);
  }
}

interface Feed {
  url: string;
  origin: string | null;
  dev: boolean;
}

/**
 * Checks GitHub Releases, downloads an installer and verifies it against the
 * release's SHA-256 list.
 *
 * The renderer never performs network work for updates. Every asset URL comes
 * from the parsed release and must point at GitHub (or, in an unpackaged test
 * build, at the local feed origin). A checksum is mandatory: if the release
 * has no SHA256SUMS asset, the update is not installed.
 *
 * Installing is deliberately limited to a packaged NSIS build. A portable EXE
 * cannot replace itself while it is running, and a source checkout should be
 * updated with git. In both cases the UI offers the downloaded file or the
 * release page instead.
 */
class Updater {
  private window: BrowserWindow | null = null;
  private release: UpdateRelease | null = null;
  private asset: ReleaseAsset | null = null;
  private filePath: string | null = null;
  private state: UpdateStatus = {
    phase: 'idle',
    currentVersion: '0.0.0',
    receivedBytes: 0,
    progress: 0,
    mode: 'source',
    canInstall: false,
    canReveal: false,
    checkedAt: null,
  };

  init(): void {
    const mode = this.detectMode();
    this.state = {
      ...this.state,
      currentVersion: app.getVersion(),
      mode,
      canInstall: mode === 'installed',
      canReveal: mode === 'portable',
    };
    this.cleanup();
  }

  attachWindow(win: BrowserWindow): void {
    this.window = win;
    this.emit();
  }

  status(): UpdateStatus {
    return { ...this.state };
  }

  async check(): Promise<UpdateStatus> {
    if (this.busy()) return this.status();
    const readyVersion = this.state.phase === 'ready' ? this.state.latestVersion : undefined;
    this.setState({ phase: 'checking', error: undefined });
    try {
      const feed = this.feed();
      const response = await net.fetch(feed.url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Kryvex/${app.getVersion()}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new UpdateFailure(
          response.status === 403
            ? 'rate-limited'
            : response.status === 404
              ? 'no-release'
              : 'download-failed',
        );
      }
      const payload: unknown = await response.json();
      const release = parseRelease(payload, { devOrigin: feed.origin });
      if (!release) throw new UpdateFailure('invalid-release');

      this.release = release;
      const keepReady = Boolean(
        readyVersion && release.version === readyVersion && this.filePath,
      );
      if (!keepReady) this.filePath = null;
      this.checked(release);

      if (!isNewer(this.state.currentVersion, release.version)) {
        this.asset = null;
        this.setState({
          phase: 'current',
          latestVersion: release.version,
          releaseName: release.name,
          notes: release.notes,
          pageUrl: release.pageUrl,
          assetName: undefined,
          assetSize: undefined,
          progress: 0,
          receivedBytes: 0,
          error: undefined,
        });
        return this.status();
      }

      // A checkout is updated with git; only packaged builds download.
      const asset =
        this.state.mode === 'source'
          ? null
          : releaseAssetFor(release, this.state.mode === 'portable');
      this.asset = asset;
      // A routine check must not throw away an installer that is already
      // downloaded and verified for this exact release.
      if (keepReady) {
        this.setState({
          phase: 'ready',
          latestVersion: release.version,
          releaseName: release.name,
          notes: release.notes,
          pageUrl: release.pageUrl,
          assetName: asset?.name,
          assetSize: asset?.size,
          progress: 1,
          error: undefined,
        });
        return this.status();
      }
      this.setState({
        phase: 'available',
        latestVersion: release.version,
        releaseName: release.name,
        notes: release.notes,
        pageUrl: release.pageUrl,
        assetName: asset?.name,
        assetSize: asset?.size,
        progress: 0,
        receivedBytes: 0,
        error: asset ? undefined : 'no-asset',
      });
    } catch (error) {
      this.asset = null;
      this.setState({ phase: 'error', error: this.codeFor(error) });
    }
    return this.status();
  }

  async download(): Promise<UpdateStatus> {
    if (this.state.mode === 'source') {
      this.setState({ phase: 'error', error: 'unsupported' });
      return this.status();
    }
    const asset = this.asset;
    if (!asset || !this.release) return this.status();
    if (this.busy()) return this.status();
    if (!isTrustedAssetUrl(asset.url, this.feed().origin)) {
      this.setState({ phase: 'error', error: 'invalid-release' });
      return this.status();
    }

    const directory = path.join(app.getPath('userData'), 'updates');
    const target = path.join(directory, asset.name);
    const part = `${target}.part`;
    this.setState({ phase: 'downloading', progress: 0, receivedBytes: 0, error: undefined });

    try {
      await fsp.mkdir(directory, { recursive: true });
      const response = await net.fetch(asset.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
      });
      if (!response.ok || !response.body) throw new UpdateFailure('download-failed');

      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > MAX_ASSET_BYTES || asset.size > MAX_ASSET_BYTES) {
        throw new UpdateFailure('too-large');
      }

      const hash = createHash('sha256');
      let received = 0;
      let emittedAt = 0;
      const body = Readable.fromWeb(
        response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>,
      );
      body.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_ASSET_BYTES) {
          body.destroy(new UpdateFailure('too-large'));
          return;
        }
        hash.update(chunk);
        const now = Date.now();
        if (now - emittedAt >= 200) {
          emittedAt = now;
          this.setState({
            receivedBytes: received,
            progress: declared ? Math.min(1, received / declared) : 0,
          });
        }
      });
      await pipeline(body, fs.createWriteStream(part));

      const digest = hash.digest('hex');
      const expected = await this.expectedChecksum(asset.name);
      if (!expected) throw new UpdateFailure('checksum-missing');
      if (expected !== digest) throw new UpdateFailure('checksum-failed');

      await fsp.rm(target, { force: true });
      await fsp.rename(part, target);
      this.pruneInstallers(directory, asset.name);
      this.filePath = target;
      this.setState({
        phase: 'ready',
        progress: 1,
        receivedBytes: received,
        assetSize: declared || received,
        error: undefined,
      });
    } catch (error) {
      await fsp.rm(part, { force: true }).catch(() => undefined);
      this.setState({ phase: 'error', error: this.codeFor(error) });
    }
    return this.status();
  }

  install(): boolean {
    const file = this.filePath;
    if (!file || this.state.phase !== 'ready') return false;
    if (this.state.mode === 'portable') {
      shell.showItemInFolder(file);
      return false;
    }
    if (!app.isPackaged || this.state.mode !== 'installed') return false;
    if (!fs.existsSync(file)) return false;

    this.setState({ phase: 'installing' });
    // Relaunch the verified installer after quitting so it can replace files.
    // It stays interactive so the user sees the usual install UI.
    app.once('quit', () => {
      try {
        spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
      } catch {
        /* the user can still run the file from the updates folder */
      }
    });
    setTimeout(() => app.quit(), 150);
    return true;
  }

  reveal(): boolean {
    if (!this.filePath) return false;
    shell.showItemInFolder(this.filePath);
    return true;
  }

  openRelease(): void {
    const url = this.state.pageUrl ?? UPDATE_RELEASES_PAGE;
    if (!url.startsWith('https://github.com/')) return;
    void shell.openExternal(url);
  }

  dispose(): void {
    this.window = null;
  }

  private expectedChecksum(name: string): Promise<string | null> {
    const checksums = this.release?.checksums;
    if (!checksums) return Promise.resolve(null);
    return (async () => {
      const response = await net.fetch(checksums.url, {
        signal: AbortSignal.timeout(CHECKSUM_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > MAX_CHECKSUM_BYTES) return null;
      return checksumFor(parseChecksums(text), name);
    })();
  }

  private feed(): Feed {
    const override = process.env.KRYVEX_UPDATE_FEED;
    if (!app.isPackaged && override) {
      try {
        const url = new URL(override);
        const loopback = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
        if (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) {
          const base = url.href.replace(/\/+$/, '');
          return { url: `${base}/latest`, origin: url.origin, dev: true };
        }
      } catch {
        /* fall through to the public feed */
      }
    }
    return { url: UPDATE_RELEASES_API, origin: null, dev: false };
  }

  private checked(release: UpdateRelease): void {
    this.setState({ checkedAt: Date.now(), latestVersion: release.version });
  }

  private detectMode(): UpdateMode {
    if (!app.isPackaged) {
      // The update harness simulates an installed build without packaging.
      return process.env.KRYVEX_UPDATE_MODE === 'installed' ? 'installed' : 'source';
    }
    if (process.env.PORTABLE_EXECUTABLE_FILE) return 'portable';
    return 'installed';
  }

  private busy(): boolean {
    return (
      this.state.phase === 'checking' ||
      this.state.phase === 'downloading' ||
      this.state.phase === 'installing'
    );
  }

  private codeFor(error: unknown): UpdateErrorCode {
    if (error instanceof UpdateFailure) return error.code;
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : '';
    if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
    if (name === 'TypeError' && /fetch|network/i.test(message)) return 'offline';
    return 'unknown';
  }

  private setState(patch: Partial<UpdateStatus>): void {
    this.state = {
      ...this.state,
      ...patch,
      canInstall: this.state.mode === 'installed',
      canReveal: this.state.mode === 'portable',
    };
    this.emit();
  }

  private emit(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send('kryvex:update:changed', this.status());
  }

  private pruneInstallers(directory: string, keep: string): void {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === keep || !/^Kryvex-(Setup|Portable)-.*\.exe$/.test(entry)) continue;
      try {
        fs.rmSync(path.join(directory, entry), { force: true });
      } catch {
        /* an old installer is harmless if it cannot be removed */
      }
    }
  }

  private cleanup(): void {
    const directory = path.join(app.getPath('userData'), 'updates');
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.part')) continue;
      try {
        fs.rmSync(path.join(directory, entry), { force: true });
      } catch {
        /* a leftover partial file is harmless */
      }
    }
  }
}

export const updater = new Updater();
