import { app, dialog, shell, type BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type WebTorrent from 'webtorrent';
import type { Torrent } from 'webtorrent';
import { isAliveWindow } from './lifecycle';
import type { TorrentRecord, TorrentResult, TorrentSource, ToastTone } from './types';
import {
  MAX_ACTIVE_TORRENTS,
  MAX_MAGNET_LENGTH,
  MAX_TORRENT_FILE_BYTES,
  MAX_TRACKERS,
  parseMagnet,
  peerCounts,
  restoreTorrentQueue,
  safeTorrentName,
  torrentFolderName,
  torrentProtocols,
} from './torrent-rules';
import { initStorage, isManagedTorrentPath, torrentRoot } from './storage';

interface TorrentEntry {
  record: TorrentRecord;
  /** Null while the row is a restored, paused placeholder. */
  torrent: Torrent | null;
}

const TORRENT_ID = /^tr-[a-f0-9-]{16,64}$/i;
const QUEUE_FILE = 'kryvex-torrents.json';
const METADATA_DIR = 'kryvex-torrent-metadata';
const MAX_QUEUE_FILE_BYTES = 4 * 1024 * 1024;
const PERSIST_DELAY = 4000;

function queuePath(): string {
  return path.join(app.getPath('userData'), QUEUE_FILE);
}

function metadataPath(id: string): string {
  return path.join(app.getPath('userData'), METADATA_DIR, `${id}.torrent`);
}

async function removeTree(target: string): Promise<boolean> {
  // Windows can keep a just-closed piece file locked for a short time. Retry
  // asynchronously so a large delete does not freeze the shell, and remove the
  // directory again once the last file releases.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await fs.promises.rm(target, {
        recursive: true,
        force: true,
        maxRetries: 1,
        retryDelay: 50,
      });
    } catch {
      /* retry below */
    }
    if (!fs.existsSync(target)) return true;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  try {
    fs.rmdirSync(target);
  } catch {
    /* still in use; leave the folder for a later cleanup attempt */
  }
  return !fs.existsSync(target);
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * The torrent queue lives behind the browser's Downloads panel. It is not a
 * browsing surface: there is no search, directory, index or recommendation
 * feed. Users supply a magnet link or a .torrent file they already have.
 *
 * The client is created lazily because WebTorrent is ESM-only and its DHT and
 * TCP listeners should not start until the first torrent is added.
 */
class TorrentManager {
  private client: WebTorrent | null = null;
  private loading: Promise<WebTorrent> | null = null;
  private entries = new Map<string, TorrentEntry>();
  private window: BrowserWindow | null = null;
  private timer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private hydrating = new Set<string>();
  private initialized = false;
  private shuttingDown = false;

  /** Load the saved rows as paused placeholders; no WebTorrent client is created. */
  init(): void {
    if (this.initialized) return;
    initStorage();
    this.initialized = true;
    try {
      const file = queuePath();
      if (!fs.existsSync(file) || fs.statSync(file).size > MAX_QUEUE_FILE_BYTES) return;
      for (const record of restoreTorrentQueue(JSON.parse(fs.readFileSync(file, 'utf8')))) {
        const savePath = path.resolve(record.savePath);
        // A queue file is user-editable. Never restore a path outside one of
        // the managed torrent roots, or a row that points at a root itself.
        // Older roots stay allowed so changing the location does not strand
        // torrents that were added before the change.
        if (!isManagedTorrentPath(savePath)) continue;
        this.entries.set(record.id, {
          record: { ...record, savePath },
          torrent: null,
        });
      }
    } catch {
      // A corrupt queue must never prevent the app from starting.
    }
  }

  attachWindow(win: BrowserWindow): void {
    this.window = win;
  }

  root(): string {
    return torrentRoot();
  }

  list(): TorrentRecord[] {
    return [...this.entries.values()]
      .map(entry => ({ ...entry.record, files: entry.record.files.map(file => ({ ...file })) }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async addMagnet(value: unknown): Promise<TorrentResult> {
    const magnet = parseMagnet(value);
    if (!magnet) return this.result(false, 'That is not a valid magnet link.');
    if (this.entries.size >= MAX_ACTIVE_TORRENTS) {
      return this.result(false, 'The torrent queue is full.');
    }
    if ([...this.entries.values()].some(entry => entry.record.infoHash === magnet.infoHash)) {
      return this.result(false, 'That torrent is already in the queue.');
    }

    const raw = String(value).trim();
    if (raw.length > MAX_MAGNET_LENGTH) return this.result(false, 'That magnet link is too long.');

    let folder = '';
    try {
      const client = await this.ensureClient();
      folder = path.join(
        this.root(),
        torrentFolderName(magnet.name || 'torrent', magnet.infoHash),
      );
      fs.mkdirSync(folder, { recursive: true });

      const torrent = client.add(raw, { path: folder });
      const record = this.createRecord(torrent, folder, {
        name: magnet.name || 'torrent',
        infoHash: magnet.infoHash,
        magnetURI: raw,
        source: 'magnet',
      });
      const entry = { record, torrent };
      this.entries.set(record.id, entry);
      this.watch(entry);
      this.persist();
      this.refresh();
      return this.result(true, 'Torrent added.', record);
    } catch (error) {
      if (folder) await removeTree(folder);
      return this.result(false, this.errorMessage(error, 'The torrent could not be added.'));
    }
  }

  async addTorrentFile(filePath: string): Promise<TorrentResult> {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return this.result(false, 'That is not a .torrent file.');
      if (stat.size > MAX_TORRENT_FILE_BYTES) {
        return this.result(false, 'That .torrent file is larger than 10 MB.');
      }
      const buffer = fs.readFileSync(filePath);
      return await this.addTorrentBuffer(buffer, path.basename(filePath, path.extname(filePath)));
    } catch (error) {
      return this.result(false, this.errorMessage(error, 'That .torrent file could not be read.'));
    }
  }

  async addFromDialog(): Promise<TorrentResult> {
    const window = this.window;
    // `showOpenDialog` needs a live parent; a destroyed window throws.
    if (!isAliveWindow(window)) return this.result(false, 'The main window is not ready.');
    const picked = await dialog.showOpenDialog(window, {
      title: 'Open a torrent file',
      properties: ['openFile'],
      filters: [{ name: 'BitTorrent metadata', extensions: ['torrent'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return this.result(false, 'Selection cancelled.');
    }
    return this.addTorrentFile(picked.filePaths[0]);
  }

  pause(id: string): TorrentResult {
    const entry = this.find(id);
    if (!entry) return this.result(false, 'That torrent is no longer in the queue.');
    if (entry.torrent) {
      entry.torrent.pause();
      // WebTorrent's pause flag stops new peers; close the current wires so the
      // UI's Pause action actually stops transfer traffic as well.
      for (const wire of entry.torrent.wires) {
        try {
          wire.destroy?.();
        } catch {
          /* a wire may already be closing */
        }
      }
    }
    entry.record.state = 'paused';
    entry.record.downloadSpeed = 0;
    entry.record.uploadSpeed = 0;
    entry.record.timeRemaining = 0;
    entry.record.updatedAt = Date.now();
    this.persist();
    this.emit();
    return this.result(true, 'Torrent paused.', entry.record);
  }

  async resume(id: string): Promise<TorrentResult> {
    const entry = this.find(id);
    if (!entry) return this.result(false, 'That torrent is no longer in the queue.');
    if (this.hydrating.has(id)) return this.result(false, 'That torrent is already resuming.');

    if (entry.torrent) {
      entry.torrent.resume();
      try {
        entry.torrent.discovery?.tracker?.update?.();
      } catch {
        /* trackers are best-effort */
      }
    } else {
      this.hydrating.add(id);
      try {
        await this.hydrate(entry);
      } catch (error) {
        entry.record.state = 'error';
        entry.record.error = this.errorMessage(
          error,
          'The saved torrent data is missing. Remove it and add it again.',
        );
        entry.record.updatedAt = Date.now();
        this.emit();
        return this.result(false, entry.record.error, entry.record);
      } finally {
        this.hydrating.delete(id);
      }
    }

    this.refresh();
    this.persist();
    this.emit();
    return this.result(true, 'Torrent resumed.', entry.record);
  }

  async show(id: string): Promise<boolean> {
    const entry = this.find(id);
    if (!entry || !fs.existsSync(entry.record.savePath)) return false;
    const error = await shell.openPath(entry.record.savePath);
    return !error;
  }

  async remove(id: string, deleteData: boolean): Promise<TorrentResult> {
    const entry = this.find(id);
    if (!entry) return this.result(false, 'That torrent is no longer in the queue.');
    if (deleteData && !isManagedTorrentPath(entry.record.savePath)) {
      return this.result(false, 'Kryvex will only delete files inside a managed torrent folder.');
    }

    try {
      if (this.client && entry.torrent) {
        // Close the store here and let removeTree below own filesystem
        // deletion. Asking fs-chunk-store to delete concurrently can leave a
        // locked file or an empty folder behind on Windows.
        await this.client.remove(entry.torrent, { destroyStore: false });
      }
    } catch {
      // A torrent can already be closing after a fatal error. Removing the
      // record and the managed folder is still the correct outcome.
    }

    this.entries.delete(id);
    this.removeMetadata(id);
    if (deleteData) await removeTree(entry.record.savePath);
    this.persist();
    this.emit();
    return this.result(
      true,
      deleteData ? 'Torrent and downloaded data removed.' : 'Torrent removed from the queue.',
    );
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    // Persist before destroying the client so the next launch has the latest
    // progress and every row, including ones that were still downloading.
    this.persist();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (this.client && !this.client.destroyed) {
      await new Promise<void>(resolve => this.client?.destroy(() => resolve()));
    }
    this.client = null;
  }

  private async addTorrentBuffer(buffer: Buffer, label: string): Promise<TorrentResult> {
    if (buffer.byteLength === 0) return this.result(false, 'That .torrent file is empty.');
    if (buffer.byteLength > MAX_TORRENT_FILE_BYTES) {
      return this.result(false, 'That .torrent file is larger than 10 MB.');
    }
    if (this.entries.size >= MAX_ACTIVE_TORRENTS) {
      return this.result(false, 'The torrent queue is full.');
    }

    let folder = '';
    try {
      const client = await this.ensureClient();
      folder = path.join(
        this.root(),
        torrentFolderName(label, crypto.randomUUID()),
      );
      fs.mkdirSync(folder, { recursive: true });

      const torrent = client.add(buffer, { path: folder });
      const record = this.createRecord(torrent, folder, {
        name: safeTorrentName(label),
        infoHash: '',
        magnetURI: '',
        source: 'file',
      });
      const entry = { record, torrent };
      this.entries.set(record.id, entry);
      this.watch(entry);
      // Keep the original metadata so the row can be resumed after a restart,
      // even if the user later moves or deletes the source .torrent file.
      this.writeMetadata(record.id, buffer);
      this.persist();
      this.refresh();
      return this.result(true, 'Torrent file added.', record);
    } catch (error) {
      if (folder) await removeTree(folder);
      return this.result(false, this.errorMessage(error, 'The torrent file could not be added.'));
    }
  }

  /** Turn a restored placeholder into a live WebTorrent entry on Resume. */
  private async hydrate(entry: TorrentEntry): Promise<void> {
    const { record } = entry;
    const folder = path.resolve(record.savePath);
    if (!isManagedTorrentPath(folder)) {
      throw new Error('Kryvex will only open files inside a managed torrent folder.');
    }

    const magnet = parseMagnet(record.magnetURI);
    let source: Buffer | string | null = null;
    if (record.source === 'file') {
      const saved = metadataPath(record.id);
      if (fs.existsSync(saved)) {
        const stat = fs.statSync(saved);
        if (!stat.isFile() || stat.size === 0 || stat.size > MAX_TORRENT_FILE_BYTES) {
          throw new Error('The saved torrent data is missing. Remove it and add it again.');
        }
        source = fs.readFileSync(saved);
      } else if (magnet) {
        source = record.magnetURI;
      }
    } else if (magnet) {
      source = record.magnetURI;
    }
    if (!source) {
      throw new Error('The saved torrent data is missing. Remove it and add it again.');
    }

    fs.mkdirSync(folder, { recursive: true });
    const client = await this.ensureClient();
    const torrent = client.add(source, { path: folder });
    entry.torrent = torrent;
    record.error = undefined;
    this.watch(entry);
  }

  private writeMetadata(id: string, buffer: Buffer): void {
    if (!TORRENT_ID.test(id)) return;
    const target = metadataPath(id);
    const tmp = `${target}.tmp`;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, target);
    } catch {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private removeMetadata(id: string): void {
    if (!TORRENT_ID.test(id)) return;
    try {
      fs.rmSync(metadataPath(id), { force: true });
    } catch {
      /* the queue record is gone even if the cache file is not */
    }
  }

  private persist(): void {
    let json: string;
    try {
      json = JSON.stringify(this.list());
    } catch {
      return;
    }
    if (json.length > MAX_QUEUE_FILE_BYTES) return;
    const target = queuePath();
    const tmp = `${target}.tmp`;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, target);
    } catch {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private persistSoon(): void {
    if (this.persistTimer || this.shuttingDown) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, PERSIST_DELAY);
    this.persistTimer.unref?.();
  }

  private async ensureClient(): Promise<WebTorrent> {
    if (this.client) return this.client;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      // WebTorrent 3 is ESM-only. A dynamic import keeps the CommonJS Electron
      // main bundle valid while still loading the real package at runtime.
      const module = await import('webtorrent');
      const Client = module.default;
      const client = new Client({
        maxConns: 80,
        // Do not silently create router port mappings. Outbound TCP, uTP,
        // DHT, PEX, LSD and trackers are enough for normal use.
        natUpnp: false,
        natPmp: false,
      });
      client.on('error', () => {
        this.notify('The torrent engine reported an error.', 'danger');
      });
      this.client = client;
      this.timer = setInterval(() => this.refresh(), 1000);
      this.timer.unref?.();
      return client;
    })();

    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private createRecord(
    torrent: Torrent,
    savePath: string,
    source: {
      name: string;
      infoHash: string;
      magnetURI: string;
      source: TorrentSource;
    },
  ): TorrentRecord {
    const now = Date.now();
    return {
      id: `tr-${crypto.randomUUID()}`,
      name: source.name,
      infoHash: source.infoHash,
      magnetURI: source.magnetURI,
      source: source.source,
      savePath,
      state: 'metadata',
      length: torrent.length || 0,
      downloaded: 0,
      uploaded: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      ratio: 0,
      progress: 0,
      timeRemaining: 0,
      peers: 0,
      seeders: 0,
      leechers: 0,
      protocols: torrentProtocols({
        tcp: true,
        dht: Boolean(this.client?.dht),
        pex: Boolean(this.client?.utPex),
        lsd: Boolean(this.client?.lsd),
        utp: Boolean(this.client?.utp),
      }),
      trackers: [],
      files: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private watch(entry: TorrentEntry): void {
    const { torrent, record } = entry;
    if (!torrent) return;

    torrent.on('infoHash', () => {
      if (!record.infoHash && torrent.infoHash) {
        record.infoHash = torrent.infoHash;
        // A .torrent file can reveal an info hash only after parsing. Check
        // for a duplicate now rather than downloading the same data twice.
        const duplicate = [...this.entries.values()].find(
          item => item !== entry && item.record.infoHash === record.infoHash,
        );
        if (duplicate) {
          this.notify('That torrent is already in the queue.', 'warning');
          void this.remove(record.id, true);
          return;
        }
        this.refresh();
        this.emit();
      }
    });

    torrent.on('ready', () => {
      this.refresh();
      this.emit();
    });

    torrent.on('done', () => {
      this.refresh();
      this.emit();
    });

    torrent.on('error', () => {
      record.state = 'error';
      record.error = 'The torrent could not continue.';
      record.updatedAt = Date.now();
      this.emit();
    });
  }

  private refresh(): void {
    let changed = false;
    for (const entry of this.entries.values()) {
      if (!entry.torrent) continue;
      this.refreshEntry(entry);
      changed = true;
    }
    if (changed) {
      this.emit();
      this.persistSoon();
    }
  }

  private refreshEntry(entry: TorrentEntry): void {
    const { torrent, record } = entry;
    if (!torrent) return;
    if (torrent.infoHash) record.infoHash = torrent.infoHash;
    if (torrent.magnetURI) record.magnetURI = torrent.magnetURI;
    if (torrent.name) record.name = torrent.name;
    if (torrent.length) record.length = torrent.length;

    record.downloaded = torrent.downloaded || 0;
    record.uploaded = torrent.uploaded || 0;
    record.downloadSpeed = torrent.downloadSpeed || 0;
    record.uploadSpeed = torrent.uploadSpeed || 0;
    record.progress = clampProgress(torrent.progress);
    record.ratio = Number.isFinite(torrent.ratio) ? torrent.ratio : 0;
    record.timeRemaining = Number.isFinite(torrent.timeRemaining) ? torrent.timeRemaining : 0;

    const counts = peerCounts(torrent.wires);
    record.peers = counts.peers;
    record.seeders = counts.seeders;
    record.leechers = counts.leechers;

    const urlList = torrent.urlList ?? [];
    record.protocols = torrentProtocols({
      tcp: true,
      dht: Boolean(this.client?.dht),
      pex: Boolean(this.client?.utPex),
      lsd: Boolean(this.client?.lsd),
      utp: Boolean(this.client?.utp),
      webSeeds: urlList.length > 0,
    });
    record.trackers = (torrent.announce ?? []).slice(0, MAX_TRACKERS);
    record.files = (torrent.files ?? []).slice(0, 250).map(file => ({
      name: file.name,
      path: file.path,
      length: file.length,
      downloaded: file.downloaded,
      progress: clampProgress(file.progress),
    }));

    if (record.state !== 'error') {
      if (torrent.paused) record.state = 'paused';
      else if (torrent.done) record.state = 'seeding';
      else if (!torrent.ready) record.state = 'metadata';
      else record.state = 'downloading';
    }
    record.updatedAt = Date.now();
  }

  private find(id: unknown): TorrentEntry | undefined {
    return typeof id === 'string' && TORRENT_ID.test(id) ? this.entries.get(id) : undefined;
  }

  private result(ok: boolean, message: string, record?: TorrentRecord): TorrentResult {
    return { ok, message, records: this.list(), ...(record ? { record } : {}) };
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message.slice(0, 240);
    return fallback;
  }

  notify(message: string, tone: ToastTone): void {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      this.window.webContents.send('kryvex:torrents:notice', { message, tone });
    } catch {
      /* the shell may be closing */
    }
  }

  private emit(): void {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      this.window.webContents.send('kryvex:torrents:changed', this.list());
    } catch {
      /* the shell may be closing */
    }
  }
}

export const torrents = new TorrentManager();
