/**
 * The optional second engine: download it once, prove the bytes, hand them over.
 *
 * Kryvex's cartridge slot runs one frontend, and that frontend publishes no
 * Dreamcast core (measured; see docs/EMULATOR_ENGINES.md). The only working
 * route is a third-party WebAssembly build of Flycast, which is GPLv2. This
 * module is written so that Kryvex never ships a copy of it: the user's own
 * machine fetches the pinned release from its publisher, every file is compared
 * against its SHA-256, and the renderer only ever receives bytes this module
 * verified.
 *
 * Boundaries kept narrow, on purpose:
 *
 * - Nothing is downloaded until the interface asks, and only from the pinned
 *   URLs in `flycast-catalogue.ts`. The renderer can say "install", "status",
 *   "give me the payload" or "remove"; it cannot name a URL or a path.
 * - Every transfer lands in `<file>.part` inside the install directory and is
 *   only renamed after its hash matches, so an interrupted or altered download
 *   never looks installed.
 * - The payload is re-hashed on the way out. A file changed on disk after
 *   install is refused rather than handed to a code loader.
 * - Electron is not imported here, so the whole path can be driven from a plain
 *   Node script and from vitest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { downloadArtifact, hashFile, type ArtifactFailure } from './artifact-download';
import {
  FLYCAST_ASSETS,
  FLYCAST_CATALOGUE,
  FLYCAST_INSTALL_BYTES,
  flycastLayout,
  type FlycastAsset,
} from './flycast-catalogue';

export type FlycastPhase = 'absent' | 'downloading' | 'ready' | 'error';

/** Stable ids: the interface turns them into words in the user's language. */
export type FlycastFailure = ArtifactFailure | 'not-installed' | 'busy';

export interface FlycastProgress {
  /** The asset being fetched, by its catalogue name. */
  file: string;
  received: number;
  total: number;
  /** Bytes across the whole install, so one bar can describe both files. */
  overall: number;
  installBytes: number;
}

export interface FlycastStatus {
  /** False on a platform or build where the main process cannot fetch it. */
  supported: boolean;
  phase: FlycastPhase;
  /** Every file is present, the right size, and hashed as the pinned release. */
  installed: boolean;
  version: string;
  label: string;
  bytes: number;
  licence: string;
  project: string;
  upstream: string;
  progress: FlycastProgress | null;
  /** The last failure, as an id, never as a sentence. */
  error?: FlycastFailure;
}

export interface FlycastPayload {
  js: Uint8Array;
  wasm: Uint8Array;
}

/** A payload read either succeeds with the bytes or names why it did not. */
export type FlycastPayloadResult =
  | ({ ok: true } & FlycastPayload)
  | { ok: false; error: FlycastFailure };

export class FlycastCore {
  private phase: FlycastPhase = 'absent';
  private progress: FlycastProgress | null = null;
  private error: FlycastFailure | undefined;
  private controller: AbortController | null = null;
  private installing = false;

  constructor(
    private readonly root: string,
    private readonly onProgress?: (progress: FlycastProgress) => void,
  ) {}

  /**
   * Present, the right size, and verified at least once since it landed.
   *
   * Verifying on every status call would re-read 10.7 MB each time a panel
   * opens; the install already proved the bytes, so a size check is enough to
   * answer "is my engine still here", and `payload()` hashes again before the
   * bytes reach a code loader.
   */
  status(): FlycastStatus {
    const installed = this.sizesMatch();
    if (this.phase !== 'downloading') {
      this.phase = installed ? 'ready' : this.error ? 'error' : 'absent';
    }
    return {
      supported: true,
      phase: this.phase,
      installed,
      version: FLYCAST_CATALOGUE.version,
      label: FLYCAST_CATALOGUE.label,
      bytes: FLYCAST_INSTALL_BYTES,
      licence: FLYCAST_CATALOGUE.licence,
      project: FLYCAST_CATALOGUE.project,
      upstream: FLYCAST_CATALOGUE.upstream,
      progress: this.progress,
      error: this.error,
    };
  }

  async install(): Promise<FlycastStatus> {
    if (this.installing) return this.status();
    if (this.sizesMatch() && this.phase !== 'error') {
      // A complete install is not re-downloaded to satisfy a second click.
      this.phase = 'ready';
      return this.status();
    }
    this.installing = true;
    this.phase = 'downloading';
    this.error = undefined;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const layout = flycastLayout(this.root);
    let overall = 0;

    try {
      await fs.promises.mkdir(layout.dir, { recursive: true });
      // A version bump leaves the previous one behind; it is not the engine
      // this build loads, so it is not allowed to sit there looking installed.
      await this.removeOtherVersions(layout.dir);

      for (const asset of FLYCAST_ASSETS) {
        const target = path.join(layout.dir, asset.name);
        this.emit(asset, 0, overall);
        const result = await downloadArtifact({
          url: asset.url,
          bytes: asset.bytes,
          sha256: asset.sha256,
          part: `${target}.part`,
          signal,
          userAgent: 'Kryvex second engine',
          onProgress: received => this.emit(asset, received, overall),
        });
        if (!result.ok) {
          this.error = result.error;
          this.phase = 'error';
          return this.status();
        }
        await fs.promises.rm(target, { force: true });
        await fs.promises.rename(`${target}.part`, target);
        overall += asset.bytes;
        this.emit(asset, asset.bytes, overall - asset.bytes);
      }

      this.progress = null;
      this.phase = 'ready';
      return this.status();
    } catch {
      this.error = signal.aborted ? 'cancelled' : 'write';
      this.phase = 'error';
      return this.status();
    } finally {
      this.installing = false;
      this.controller = null;
    }
  }

  /** Stops an install in flight; the partial files are already discarded. */
  cancel(): boolean {
    if (!this.controller) return false;
    this.controller.abort();
    return true;
  }

  /**
   * The verified bytes, for a game that needs the second engine.
   *
   * The hashes are checked again here, not trusted from the install: this is
   * the only point where the app hands a binary to a code loader.
   */
  async payload(): Promise<FlycastPayloadResult> {
    if (this.phase === 'downloading') return { ok: false, error: 'busy' };
    if (!this.sizesMatch()) return { ok: false, error: 'not-installed' };
    const layout = flycastLayout(this.root);
    const controller = new AbortController();
    const read = async (asset: FlycastAsset, file: string): Promise<Uint8Array | null> => {
      try {
        const digest = await hashFile(file, asset.bytes, controller.signal);
        if (digest !== asset.sha256) return null;
        return new Uint8Array(await fs.promises.readFile(file));
      } catch {
        return null;
      }
    };
    const js = await read(FLYCAST_CATALOGUE.js, layout.js);
    if (!js) return { ok: false, error: 'hash' };
    const wasm = await read(FLYCAST_CATALOGUE.wasm, layout.wasm);
    if (!wasm) return { ok: false, error: 'hash' };
    return { ok: true, js, wasm };
  }

  async remove(): Promise<FlycastStatus> {
    this.cancel();
    this.error = undefined;
    this.progress = null;
    this.phase = 'absent';
    await fs.promises.rm(flycastLayout(this.root).dir, { recursive: true, force: true }).catch(() => undefined);
    return this.status();
  }

  private emit(asset: FlycastAsset, received: number, overall: number): void {
    const total = asset.bytes;
    const progress: FlycastProgress = {
      file: asset.name,
      received,
      total,
      overall: Math.min(FLYCAST_INSTALL_BYTES, overall + received),
      installBytes: FLYCAST_INSTALL_BYTES,
    };
    this.progress = progress;
    this.onProgress?.(progress);
  }

  /** Every pinned file is present at its pinned size. */
  private sizesMatch(): boolean {
    const layout = flycastLayout(this.root);
    return FLYCAST_ASSETS.every(asset => {
      const file = path.join(layout.dir, asset.name);
      try {
        return fs.statSync(file).size === asset.bytes;
      } catch {
        return false;
      }
    });
  }

  /** Old versions are removed when a new one is installed, never on launch. */
  private async removeOtherVersions(current: string): Promise<void> {
    let names: string[] = [];
    try {
      names = await fs.promises.readdir(this.root);
    } catch {
      return;
    }
    for (const name of names) {
      const candidate = path.join(this.root, name);
      if (candidate === current) continue;
      if (!name.startsWith('v')) continue;
      await fs.promises.rm(candidate, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
