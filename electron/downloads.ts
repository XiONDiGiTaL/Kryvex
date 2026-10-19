import { app, shell, type BrowserWindow, type DownloadItem, type Session } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DownloadRecord, DownloadResult, DownloadState } from './types';
import { MAX_DOWNLOAD_RECORDS, sanitizeDownloadRecords } from './download-rules';

const RECORDS_FILE = 'kryvex-downloads.json';
const MAX_RECORDS_FILE_BYTES = 1024 * 1024;

function downloadsDir(): string {
  return app.getPath('downloads');
}

function recordsFile(): string {
  return path.join(app.getPath('userData'), RECORDS_FILE);
}

function safeFilename(value: string): string {
  const base = path.basename(value || 'download');
  const cleaned = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'download';
  return cleaned.slice(0, 180);
}

function uniquePath(dir: string, filename: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(dir, filename);
  let index = 1;
  while (fs.existsSync(candidate) && index < 1000) {
    candidate = path.join(dir, `${stem} (${index})${extension}`);
    index += 1;
  }
  return candidate;
}

function insideDownloads(file: string): boolean {
  if (!file) return false;
  const root = path.resolve(downloadsDir());
  const target = path.resolve(file);
  return target.startsWith(`${root}${path.sep}`);
}

function terminal(state: DownloadState): boolean {
  return state === 'completed' || state === 'cancelled' || state === 'interrupted';
}

/**
 * Tracks every download across the shell, services and browser sessions.
 * Records live in main; the renderer only receives display data and can ask
 * for a specific tracked record to be paused, cancelled or removed.
 */
class DownloadManager {
  private records = new Map<string, DownloadRecord>();
  private items = new Map<string, DownloadItem>();
  private order: string[] = [];
  private sessions = new WeakSet<Session>();
  private window: BrowserWindow | null = null;
  private torrentFileHandler: ((filePath: string) => void) | null = null;
  private initialized = false;

  /** Load completed history once the ready event has made userData available. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const file = recordsFile();
      if (!fs.existsSync(file) || fs.statSync(file).size > MAX_RECORDS_FILE_BYTES) return;
      const records = sanitizeDownloadRecords(JSON.parse(fs.readFileSync(file, 'utf8')));
      for (const record of records) {
        this.records.set(record.id, record);
        this.order.push(record.id);
      }
    } catch {
      // A corrupt history file must never stop the app or block new downloads.
    }
  }

  attachWindow(win: BrowserWindow): void {
    this.window = win;
  }

  /** A completed .torrent download is metadata, so hand it to the queue. */
  setTorrentFileHandler(handler: ((filePath: string) => void) | null): void {
    this.torrentFileHandler = handler;
  }

  trackSession(ses: Session): void {
    if (this.sessions.has(ses)) return;
    this.sessions.add(ses);
    ses.on('will-download', (_event, item) => this.start(item));
  }

  list(): DownloadRecord[] {
    return this.order
      .map(id => this.records.get(id))
      .filter((record): record is DownloadRecord => Boolean(record));
  }

  pause(id: string): boolean {
    const item = this.items.get(id);
    const record = this.records.get(id);
    if (!item || !record) return false;
    try {
      if (item.isPaused()) {
        item.resume();
        record.state = 'progressing';
      } else {
        item.pause();
        record.state = 'paused';
      }
      record.updatedAt = Date.now();
      this.persist();
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  cancel(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;
    try {
      item.cancel();
      return true;
    } catch {
      return false;
    }
  }

  show(id: string): boolean {
    const record = this.records.get(id);
    if (!record || !record.savePath || !fs.existsSync(record.savePath)) return false;
    try {
      shell.showItemInFolder(record.savePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Opens a finished download with the Windows default handler. */
  async open(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || !insideDownloads(record.savePath) || !fs.existsSync(record.savePath)) {
      return false;
    }
    try {
      return (await shell.openPath(record.savePath)) === '';
    } catch {
      return false;
    }
  }

  remove(id: string, deleteFile: boolean): DownloadResult {
    const record = this.records.get(id);
    if (!record) return this.result(false, 'That download is no longer in the list.');
    if (!terminal(record.state)) {
      return this.result(false, 'Cancel the download before removing it.');
    }

    if (deleteFile) {
      if (!record.savePath || !insideDownloads(record.savePath)) {
        return this.result(false, 'Kryvex will only delete files it saved in your Downloads folder.');
      }
      try {
        fs.rmSync(record.savePath, { force: true });
      } catch {
        return this.result(false, 'The downloaded file could not be deleted.');
      }
    }

    this.records.delete(id);
    this.order = this.order.filter(item => item !== id);
    this.persist();
    this.emit();
    return this.result(true, deleteFile ? 'Downloaded file deleted.' : 'Download removed from the list.');
  }

  clearFinished(): DownloadRecord[] {
    const removed = new Set(
      this.list()
        .filter(record => terminal(record.state))
        .map(record => record.id),
    );
    for (const id of removed) {
      this.records.delete(id);
      this.items.delete(id);
    }
    if (removed.size > 0) {
      this.order = this.order.filter(id => !removed.has(id));
      this.persist();
      this.emit();
    }
    return this.list();
  }

  private start(item: DownloadItem): void {
    const id = `dl-${crypto.randomUUID()}`;
    const filename = safeFilename(item.getFilename());
    let savePath = '';
    try {
      savePath = uniquePath(downloadsDir(), filename);
      item.setSavePath(savePath);
    } catch {
      // If the automatic path cannot be set, Electron may fall back to its
      // save dialog. The record still tracks progress and the final path.
      savePath = '';
    }

    const record: DownloadRecord = {
      id,
      filename,
      url: item.getURL().slice(0, 2048),
      savePath,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      state: 'progressing',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.records.set(id, record);
    this.items.set(id, item);
    this.order.unshift(id);
    this.trim();
    this.persist();
    this.emit();

    const update = (nextState?: DownloadState) => {
      const current = this.records.get(id);
      if (!current) return;
      current.receivedBytes = item.getReceivedBytes();
      current.totalBytes = item.getTotalBytes();
      if (item.getSavePath()) current.savePath = item.getSavePath();
      if (nextState) current.state = nextState;
      current.updatedAt = Date.now();
      this.emit();
    };

    item.on('updated', (_event, state) => {
      update(state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing');
    });

    item.once('done', (_event, state) => {
      update(state);
      this.items.delete(id);
      this.persist();
      this.emit();
      if (state === 'completed') {
        const completed = this.records.get(id);
        if (completed?.savePath && /\.torrent$/i.test(completed.savePath)) {
          try {
            this.torrentFileHandler?.(completed.savePath);
          } catch {
            /* the torrent manager is optional */
          }
        }
      }
    });
  }

  private trim(): void {
    while (this.order.length > MAX_DOWNLOAD_RECORDS) {
      const index = [...this.order]
        .reverse()
        .findIndex(id => terminal(this.records.get(id)?.state ?? 'completed'));
      if (index < 0) return;
      const id = [...this.order].reverse()[index];
      this.records.delete(id);
      this.order = this.order.filter(item => item !== id);
    }
  }

  /**
   * Completed and interrupted entries are the download library, so they must
   * outlive the process. Progress events are not written on every tick; a
   * live download becomes an interrupted row on the next launch.
   */
  private persist(): void {
    if (!this.initialized) return;
    const target = recordsFile();
    const temp = `${target}.tmp`;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(temp, JSON.stringify(this.list()), 'utf8');
      fs.renameSync(temp, target);
    } catch {
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private emit(): void {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      this.window.webContents.send('kryvex:downloads:changed', this.list());
    } catch {
      /* the window may be closing while a download finishes */
    }
  }

  private result(ok: boolean, message: string): DownloadResult {
    return { ok, message, records: this.list() };
  }
}

export const downloads = new DownloadManager();
