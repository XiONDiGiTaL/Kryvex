/**
 * Downloads a reviewed model artifact, and nothing else.
 *
 * The renderer names a catalogue id; this module owns every URL, host, byte
 * count, hash and path. A download is streamed to `<id>.part` while it is
 * hashed, and only an exact byte count with a matching SHA-256 may be renamed
 * into place. A cancelled or failed transfer never leaves an installable file.
 *
 * Inference stays where it was: this module never starts a server. A finished
 * model is handed to the existing `LocalModel.configure` path by the user.
 */
import { app, type BrowserWindow } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MODEL_CATALOGUE, catalogueEntry } from './model-catalogue';
import { localModel } from './local-model';
import {
  MAX_MODEL_BYTES,
  MAX_REDIRECTS,
  catalogueUrl,
  canDeleteModel,
  installedFileName,
  isSafeModelId,
  modelPath,
  parseModelUrl,
  requiredFreeBytes,
  resolveRedirect,
  validateCatalogueEntry,
  verifyArtifact,
  type CatalogueEntry,
  type DownloadProgress,
  type InstalledModel,
} from './model-rules';

export type ModelFailure =
  | 'not-in-catalogue'
  | 'invalid-entry'
  | 'already-installed'
  | 'disk-space'
  | 'network'
  | 'size'
  | 'hash'
  | 'cancelled'
  | 'write'
  | 'running';

export type ModelResult =
  | { ok: true; model: InstalledModel }
  | { ok: false; error: ModelFailure };

export interface InstalledRow extends InstalledModel {
  present: boolean;
  /** The resolved file the existing model picker would receive. */
  path: string;
}

const PROGRESS_EVERY_MS = 160;
const PROGRESS_EVERY_BYTES = 4 * 1024 * 1024;
const MAX_LIBRARY_ENTRIES = 32;

class ModelManager {
  private window: BrowserWindow | null = null;
  private library: InstalledModel[] = [];
  private downloads = new Map<string, AbortController>();
  private loaded = false;

  private get modelsDir(): string {
    return path.join(app.getPath('userData'), 'models');
  }

  private get libraryPath(): string {
    return path.join(app.getPath('userData'), 'kryvex-models.json');
  }

  init(): void {
    fs.mkdirSync(this.modelsDir, { recursive: true });
    this.loadLibrary();
    this.sweepPartials();
  }

  attachWindow(win: BrowserWindow | null): void {
    this.window = win;
  }

  private loadLibrary(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.libraryPath, 'utf8')) as { models?: unknown };
      const rows = Array.isArray(raw.models) ? raw.models : [];
      this.library = rows
        .filter((row): row is InstalledModel => {
          if (!row || typeof row !== 'object') return false;
          const value = row as Record<string, unknown>;
          return (
            isSafeModelId(value.id) &&
            typeof value.filename === 'string' &&
            typeof value.bytes === 'number' &&
            typeof value.sha256 === 'string' &&
            typeof value.installedAt === 'string'
          );
        })
        .slice(0, MAX_LIBRARY_ENTRIES);
    } catch {
      this.library = [];
    }
    this.loaded = true;
  }

  private saveLibrary(): void {
    const target = this.libraryPath;
    const tmp = `${target}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify({ models: this.library }, null, 2), 'utf8');
      fs.renameSync(tmp, target);
    } catch {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* nothing to clean */
      }
    }
  }

  /** A `.part` file is never an installed model; drop leftovers at launch. */
  private sweepPartials(): void {
    try {
      for (const name of fs.readdirSync(this.modelsDir)) {
        if (name.endsWith('.part')) fs.rmSync(path.join(this.modelsDir, name), { force: true });
      }
    } catch {
      /* a missing directory is created on first install */
    }
  }

  catalogue(): CatalogueEntry[] {
    return MODEL_CATALOGUE.filter(entry => validateCatalogueEntry(entry).length === 0);
  }

  installed(): InstalledRow[] {
    return this.library.map(row => ({
      ...row,
      present: fs.existsSync(modelPath(this.modelsDir, row.id)),
      path: modelPath(this.modelsDir, row.id),
    }));
  }

  private emit(progress: DownloadProgress): void {
    try {
      this.window?.webContents.send('kryvex:models:progress', progress);
    } catch {
      /* the window may be closing */
    }
  }

  private async freeBytes(): Promise<number | null> {
    try {
      const stats = fs.statfsSync(this.modelsDir);
      return stats.bavail * stats.bsize;
    } catch {
      return null;
    }
  }

  async download(rawId: unknown): Promise<ModelResult> {
    if (!this.loaded) this.init();
    if (!isSafeModelId(rawId)) return { ok: false, error: 'not-in-catalogue' };
    const entry = catalogueEntry(rawId);
    if (!entry) return { ok: false, error: 'not-in-catalogue' };
    if (validateCatalogueEntry(entry).length > 0) return { ok: false, error: 'invalid-entry' };
    if (entry.bytes > MAX_MODEL_BYTES) return { ok: false, error: 'invalid-entry' };

    const target = modelPath(this.modelsDir, entry.id);
    if (this.library.some(row => row.id === entry.id) && fs.existsSync(target)) {
      return { ok: false, error: 'already-installed' };
    }
    if (this.downloads.has(entry.id)) return { ok: false, error: 'network' };

    const free = await this.freeBytes();
    if (free !== null && free < requiredFreeBytes(entry.bytes)) {
      return { ok: false, error: 'disk-space' };
    }

    const part = `${target}.part`;
    const controller = new AbortController();
    this.downloads.set(entry.id, controller);
    try {
      await fs.promises.mkdir(this.modelsDir, { recursive: true });
      await fs.promises.rm(part, { force: true });

      const start = parseModelUrl(catalogueUrl(entry));
      if (!start) return { ok: false, error: 'invalid-entry' };

      const response = await this.open(start.href, controller.signal);
      await this.writeBody(entry, response, part, controller.signal);

      this.emit({ id: entry.id, phase: 'verifying', received: entry.bytes, total: entry.bytes });
      const sha256 = await this.hashFile(part, entry.bytes, controller.signal);
      const verdict = verifyArtifact({
        receivedBytes: fs.statSync(part).size,
        sha256,
        expectedBytes: entry.bytes,
        expectedSha256: entry.sha256,
      });
      if (!verdict.ok) throw new ModelError(verdict.reason === 'hash' ? 'hash' : 'size');

      await fs.promises.rename(part, target);
      const model: InstalledModel = {
        id: entry.id,
        name: entry.name,
        filename: installedFileName(entry.id),
        bytes: entry.bytes,
        sha256: entry.sha256,
        installedAt: new Date().toISOString(),
        licence: entry.licence,
        revision: entry.revision,
      };
      this.library = [model, ...this.library.filter(row => row.id !== entry.id)];
      this.saveLibrary();
      this.emit({ id: entry.id, phase: 'installed', received: entry.bytes, total: entry.bytes });
      return { ok: true, model };
    } catch (error) {
      await fs.promises.rm(part, { force: true }).catch(() => undefined);
      const code = error instanceof ModelError ? error.code : controller.signal.aborted ? 'cancelled' : 'network';
      this.emit({
        id: entry.id,
        phase: code === 'cancelled' ? 'cancelled' : 'failed',
        received: 0,
        total: entry.bytes,
        ...(code === 'cancelled' ? {} : { error: code }),
      });
      return { ok: false, error: code };
    } finally {
      this.downloads.delete(entry.id);
    }
  }

  /** One request, following only allowlisted HTTPS redirects. */
  private async open(url: string, signal: AbortSignal): Promise<Response> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const parsed = parseModelUrl(current);
      if (!parsed) throw new ModelError('network');
      const response = await fetch(parsed.href, {
        redirect: 'manual',
        signal,
        headers: { 'User-Agent': 'Kryvex model manager' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);
        if (!location) throw new ModelError('network');
        const next = resolveRedirect(current, location);
        if (!next) throw new ModelError('network');
        current = next;
        continue;
      }
      if (!response.ok || !response.body) throw new ModelError('network');
      return response;
    }
    throw new ModelError('network');
  }

  private async writeBody(
    entry: CatalogueEntry,
    response: Response,
    part: string,
    signal: AbortSignal,
  ): Promise<void> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > 0 && declared !== entry.bytes) {
      throw new ModelError('size');
    }
    const handle = await fs.promises.open(part, 'w');
    let received = 0;
    let lastEmit = 0;
    let lastBytes = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        if (signal.aborted) throw new ModelError('cancelled');
        const buffer = Buffer.from(chunk);
        received += buffer.length;
        if (received > entry.bytes) throw new ModelError('size');
        await handle.write(buffer);
        const now = Date.now();
        if (now - lastEmit > PROGRESS_EVERY_MS || received - lastBytes > PROGRESS_EVERY_BYTES) {
          lastEmit = now;
          lastBytes = received;
          this.emit({ id: entry.id, phase: 'downloading', received, total: entry.bytes });
        }
      }
    } finally {
      await handle.close();
    }
    if (received !== entry.bytes) throw new ModelError('size');
    this.emit({ id: entry.id, phase: 'downloading', received, total: entry.bytes });
  }

  /** Re-reads what actually landed; the stream hash is not trusted across a close. */
  private async hashFile(file: string, expectedBytes: number, signal: AbortSignal): Promise<string> {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(file);
    let read = 0;
    for await (const chunk of stream) {
      if (signal.aborted) throw new ModelError('cancelled');
      read += chunk.length;
      if (read > expectedBytes) throw new ModelError('size');
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  }

  cancel(rawId: unknown): boolean {
    if (!isSafeModelId(rawId)) return false;
    const controller = this.downloads.get(rawId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async remove(rawId: unknown): Promise<ModelResult> {
    if (!isSafeModelId(rawId)) return { ok: false, error: 'not-in-catalogue' };
    const entry = this.library.find(row => row.id === rawId);
    if (!entry) return { ok: false, error: 'not-in-catalogue' };
    const file = modelPath(this.modelsDir, entry.id);
    const pathOk = path.resolve(file).startsWith(path.resolve(this.modelsDir) + path.sep);
    if (!pathOk) return { ok: false, error: 'invalid-entry' };
    // Only a server that is actually serving this file blocks the delete; a
    // model that is merely selected is fine to remove.
    const status = localModel.status();
    const runningPath =
      status.phase === 'running' || status.phase === 'starting' ? status.path : '';
    if (!canDeleteModel(entry, runningPath, this.modelsDir)) {
      return { ok: false, error: 'running' };
    }
    try {
      await fs.promises.rm(file, { force: true });
    } catch {
      return { ok: false, error: 'write' };
    }
    this.library = this.library.filter(row => row.id !== entry.id);
    this.saveLibrary();
    return { ok: true, model: entry };
  }
}

class ModelError extends Error {
  constructor(public readonly code: ModelFailure) {
    super(code);
  }
}

export const modelManager = new ModelManager();
