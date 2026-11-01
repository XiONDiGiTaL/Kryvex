import { app, BrowserWindow, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * The disk half of a room file transfer.
 *
 * The renderer receives the bytes over the room's data channels and hands each
 * chunk here; this object is the only thing that touches the disk, and it holds
 * the same two lines the rest of Kryvex does:
 *
 * - the destination comes from a native save dialog, never from the wire, so a
 *   peer cannot nominate a path;
 * - the file is written as `<name>.kryvexpart` and only renamed once every
 *   declared byte has arrived, so a cancelled transfer never leaves a
 *   half-written file under the real name.
 *
 * There is deliberately no size limit here: the declared size is the only cap,
 * and it is enforced so a sender cannot write past what the receiver agreed to
 * store.
 */

export interface TransferBeginResult {
  ok: boolean;
  token?: string;
  path?: string;
  name?: string;
  cancelled?: boolean;
  code?: string;
}

export interface TransferWriteResult {
  ok: boolean;
  received?: number;
  code?: string;
}

export interface TransferFinishResult {
  ok: boolean;
  path?: string;
  size?: number;
  code?: string;
}

/** One chunk is a quarter of a megabyte; this is a ceiling, not a target. */
const MAX_CHUNK_BYTES = 1024 * 1024;
const MAX_NAME = 180;

interface Sink {
  token: string;
  part: string;
  target: string;
  fd: number;
  declared: number;
  written: number;
}

/** A peer chose this string, so only a plain file name is accepted. */
function plainName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (!name || name.length > MAX_NAME) return null;
  if (name === '.' || name === '..') return null;
  if (path.basename(name) !== name) return null;
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return null;
  return name;
}

function toBuffer(raw: unknown): Buffer | null {
  if (raw instanceof Uint8Array) return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  return null;
}

class TransferSink {
  private win: BrowserWindow | null = null;
  private sinks = new Map<string, Sink>();
  /** Paths this process finished, so only those can be revealed or opened. */
  private finished = new Set<string>();

  attachWindow(win: BrowserWindow): void {
    this.win = win;
    win.once('closed', () => {
      if (this.win === win) this.win = null;
      for (const sink of [...this.sinks.values()]) this.discard(sink);
    });
  }

  private parent(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  private folder(): string {
    try {
      return path.join(app.getPath('downloads'), 'Kryvex Transfers');
    } catch {
      return app.getPath('temp');
    }
  }

  /** The save dialog is the only way a destination exists. */
  async begin(request: unknown): Promise<TransferBeginResult> {
    const source = (request ?? {}) as { name?: unknown; size?: unknown };
    const name = plainName(source.name);
    const size = Number(source.size);
    if (!name || !Number.isSafeInteger(size) || size < 0) return { ok: false, code: 'invalid' };

    const options: Electron.SaveDialogOptions = {
      title: 'Choose where to save the file',
      buttonLabel: 'Save here',
      defaultPath: path.join(this.folder(), name),
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    };
    const window = this.parent();
    const choice = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return { ok: false, cancelled: true };

    const target = choice.filePath;
    const part = `${target}.kryvexpart`;
    let fd: number;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fd = fs.openSync(part, 'w');
    } catch {
      return { ok: false, code: 'write-failed' };
    }
    const token = randomUUID();
    this.finished.delete(target);
    this.sinks.set(token, { token, part, target, fd, declared: size, written: 0 });
    return { ok: true, token, path: target, name: path.basename(target) };
  }

  write(request: unknown): TransferWriteResult {
    const source = (request ?? {}) as { token?: unknown; bytes?: unknown };
    const sink = typeof source.token === 'string' ? this.sinks.get(source.token) : undefined;
    if (!sink) return { ok: false, code: 'no-sink' };
    const bytes = toBuffer(source.bytes);
    if (!bytes || bytes.length === 0 || bytes.length > MAX_CHUNK_BYTES) {
      return { ok: false, code: 'bad-chunk' };
    }
    // A chunk may never take the file past the size the receiver agreed to.
    if (sink.written + bytes.length > sink.declared) return { ok: false, code: 'beyond-size' };
    try {
      fs.writeSync(sink.fd, bytes);
    } catch {
      return { ok: false, code: 'write-failed' };
    }
    sink.written += bytes.length;
    return { ok: true, received: sink.written };
  }

  finish(token: unknown): TransferFinishResult {
    const sink = typeof token === 'string' ? this.sinks.get(token) : undefined;
    if (!sink) return { ok: false, code: 'no-sink' };
    if (sink.written !== sink.declared) {
      this.discard(sink);
      return { ok: false, code: 'incomplete' };
    }
    try {
      fs.fsyncSync(sink.fd);
      fs.closeSync(sink.fd);
    } catch {
      this.discard(sink);
      return { ok: false, code: 'write-failed' };
    }
    try {
      // The dialog already asked before replacing a file the user picked.
      if (fs.existsSync(sink.target)) fs.rmSync(sink.target, { force: true });
      fs.renameSync(sink.part, sink.target);
    } catch {
      try {
        fs.rmSync(sink.part, { force: true });
      } catch {
        /* nothing left to clean */
      }
      this.sinks.delete(sink.token);
      return { ok: false, code: 'write-failed' };
    }
    this.sinks.delete(sink.token);
    this.finished.add(sink.target);
    return { ok: true, path: sink.target, size: sink.written };
  }

  abort(token: unknown): boolean {
    const sink = typeof token === 'string' ? this.sinks.get(token) : undefined;
    if (!sink) return false;
    this.discard(sink);
    return true;
  }

  reveal(raw: unknown): boolean {
    if (typeof raw !== 'string' || !this.finished.has(raw)) return false;
    try {
      if (!fs.statSync(raw).isFile()) return false;
    } catch {
      return false;
    }
    shell.showItemInFolder(raw);
    return true;
  }

  private discard(sink: Sink): void {
    this.sinks.delete(sink.token);
    try {
      fs.closeSync(sink.fd);
    } catch {
      /* already closed */
    }
    try {
      fs.rmSync(sink.part, { force: true });
    } catch {
      /* the partial file is gone or was never created */
    }
  }
}

export const transferSink = new TransferSink();
