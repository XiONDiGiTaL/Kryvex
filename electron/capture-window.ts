import {
  app,
  BrowserWindow,
  ClipboardItem,
  clipboard,
  dialog,
  ipcMain,
  screen,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureFileName, captureLimit, decodeCapture } from './capture-rules';
import {
  previewBounds,
  previewDimension,
  previewKind,
  previewLanguage,
  previewTarget,
} from './capture-window-rules';

/**
 * The capture preview window.
 *
 * A capture used to be previewed inside the Home card, which is a postage stamp
 * for deciding whether to keep a screenshot. This is the window a snipping tool
 * puts up instead: the picture at its own size, and one row of controls to copy
 * it, choose where to save it, pin it above other windows, or start another.
 *
 * The file is written once, to the temp folder, under an id the page never
 * learns a path from; the page is handed a `file://` URL and the actions come
 * back through this class, which owns the save dialog. Only two senders are
 * accepted: the shell (to open the window) and this window itself (to act on
 * what it is showing).
 */
interface Payload {
  id: string;
  file: string;
  kind: 'shot' | 'clip';
  name: string;
  bytes: number;
  width: number;
  height: number;
  target: string;
  language: ReturnType<typeof previewLanguage>;
  savedPath: string | null;
  pinned: boolean;
}

export interface CaptureWindowInfo {
  kind: 'shot' | 'clip';
  name: string;
  target: string;
  width: number;
  height: number;
  bytes: number;
  url: string;
  savedPath: string | null;
  pinned: boolean;
  language: string;
  version: string;
}

export interface CaptureWindowResult {
  ok: boolean;
  path?: string;
  cancelled?: boolean;
  message?: string;
}

const TEMP_DIR = 'kryvex-captures';
/** Temp payloads older than this are swept when a new window opens. */
const STALE_MS = 6 * 60 * 60 * 1000;

class CaptureWindow {
  private win: BrowserWindow | null = null;
  private shell: BrowserWindow | null = null;
  private payload: Payload | null = null;
  private ipcReady = false;

  attachShell(win: BrowserWindow | null): void {
    this.shell = win;
  }

  /**
   * Opens (or refreshes) the preview for one capture. The bytes are validated
   * before anything touches the disk, so a malformed request costs nothing but
   * an answer.
   */
  async open(raw: unknown): Promise<CaptureWindowResult> {
    const request = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const kind = previewKind(request.kind);
    const bytes = decodeCapture(request.data, captureLimit(kind));
    if (!bytes) return { ok: false, message: 'The capture was empty or too large to preview.' };

    let file: string;
    try {
      const dir = path.join(app.getPath('temp'), TEMP_DIR);
      fs.mkdirSync(dir, { recursive: true });
      this.sweep(dir);
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      file = path.join(dir, `${id}.${kind === 'clip' ? 'webm' : 'png'}`);
      fs.writeFileSync(file, bytes);
      this.discardPayload();
      this.payload = {
        id,
        file,
        kind,
        name: captureFileName(request.name, kind),
        bytes: bytes.length,
        width: previewDimension(request.width),
        height: previewDimension(request.height),
        target: previewTarget(request.target),
        language: previewLanguage(request.language),
        savedPath: null,
        pinned: false,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'The capture could not be prepared.',
      };
    }

    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.reload();
      this.win.show();
      this.win.focus();
      return { ok: true };
    }

    this.create();
    return { ok: true };
  }

  registerIpc(): void {
    if (this.ipcReady) return;
    this.ipcReady = true;
    ipcMain.handle('kryvex:capture:window:info', (event) =>
      this.isPreview(event) ? this.info() : null,
    );
    ipcMain.handle('kryvex:capture:window:save', (event) =>
      this.isPreview(event) ? this.save() : { ok: false, message: 'Untrusted sender.' },
    );
    ipcMain.handle('kryvex:capture:window:copy', (event) =>
      this.isPreview(event) ? this.copy() : false,
    );
    ipcMain.handle('kryvex:capture:window:reveal', (event) =>
      this.isPreview(event) ? this.reveal() : false,
    );
    ipcMain.handle('kryvex:capture:window:pin', (event, enabled: unknown) =>
      this.isPreview(event) ? this.pin(enabled === true) : false,
    );
    ipcMain.handle('kryvex:capture:window:new', (event) => {
      if (!this.isPreview(event)) return false;
      this.fresh();
      return true;
    });
    ipcMain.handle('kryvex:capture:window:close', (event) => {
      if (!this.isPreview(event)) return false;
      this.win?.close();
      return true;
    });
  }

  private create(): void {
    const payload = this.payload;
    const work = screen.getPrimaryDisplay().workAreaSize;
    const bounds = previewBounds(payload?.width ?? 0, payload?.height ?? 0, work);

    const win = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      minWidth: 420,
      minHeight: 320,
      show: false,
      backgroundColor: '#0B0E12',
      title: 'Kryvex Capture',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'capture-window-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        // A throwaway session: the preview shows one local file and needs no
        // cookies, storage or service state of its own.
        partition: 'capture-preview',
      },
    });

    this.win = win;
    win.once('ready-to-show', () => win.show());
    // The page's own <title> must not rename a window the user identifies by it.
    win.on('page-title-updated', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('closed', () => {
      if (this.win === win) this.win = null;
      this.discardPayload();
    });

    void win.loadFile(path.join(__dirname, '..', 'dist', 'capture.html'));
  }

  private info(): CaptureWindowInfo | null {
    const payload = this.payload;
    if (!payload) return null;
    return {
      kind: payload.kind,
      name: payload.name,
      target: payload.target,
      width: payload.width,
      height: payload.height,
      bytes: payload.bytes,
      url: pathToFileURL(payload.file).href,
      savedPath: payload.savedPath,
      pinned: payload.pinned,
      language: payload.language,
      version: app.getVersion(),
    };
  }

  private folder(): string {
    const downloads = app.getPath('downloads');
    const folder = path.join(downloads, 'Kryvex Captures');
    try {
      fs.mkdirSync(folder, { recursive: true });
      return folder;
    } catch {
      return downloads;
    }
  }

  private async save(): Promise<CaptureWindowResult> {
    const payload = this.payload;
    if (!payload) return { ok: false, message: 'There is nothing to save.' };
    if (!fs.existsSync(payload.file)) return { ok: false, message: 'The capture is no longer on disk.' };

    const options = {
      title: payload.kind === 'clip' ? 'Save recording' : 'Save capture',
      defaultPath: path.join(this.folder(), payload.name),
      filters:
        payload.kind === 'clip'
          ? [{ name: 'WebM video', extensions: ['webm'] }]
          : [{ name: 'PNG image', extensions: ['png'] }],
      properties: ['createDirectory' as const, 'showOverwriteConfirmation' as const],
    };
    const picked =
      this.win && !this.win.isDestroyed()
        ? await dialog.showSaveDialog(this.win, options)
        : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { ok: false, cancelled: true };

    // The filter is a hint: a typed name can still arrive without the extension
    // the file needs to open.
    const target = new RegExp(`\\.(${payload.kind === 'clip' ? 'webm' : 'png'})$`, 'i').test(picked.filePath)
      ? picked.filePath
      : `${picked.filePath}.${payload.kind === 'clip' ? 'webm' : 'png'}`;
    try {
      fs.copyFileSync(payload.file, target);
      payload.savedPath = target;
      this.announceSaved(payload, target);
      return { ok: true, path: target };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'The capture could not be written.',
      };
    }
  }

  /** A recording has no single frame to put on the clipboard. */
  private async copy(): Promise<boolean> {
    const payload = this.payload;
    if (!payload || payload.kind !== 'shot') return false;
    try {
      const bytes = fs.readFileSync(payload.file);
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      await clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }

  private reveal(): boolean {
    const target = this.payload?.savedPath;
    if (!target) return false;
    try {
      if (!fs.statSync(target).isFile()) return false;
    } catch {
      return false;
    }
    shell.showItemInFolder(target);
    return true;
  }

  private pin(enabled: boolean): boolean {
    const payload = this.payload;
    if (!payload || !this.win || this.win.isDestroyed()) return false;
    payload.pinned = enabled;
    this.win.setAlwaysOnTop(enabled, 'floating');
    return enabled;
  }

  /** "New capture": hand the user back to the card that takes one. */
  private fresh(): void {
    this.win?.close();
    const shellWindow = this.shell;
    if (!shellWindow || shellWindow.isDestroyed()) return;
    shellWindow.show();
    shellWindow.focus();
    try {
      shellWindow.webContents.send('kryvex:capture:ask');
    } catch {
      /* the shell is closing */
    }
  }

  /**
   * The board's recent list lives in the shell, so a save taken in this window
   * has to be reported back or the card would not know it happened.
   */
  private announceSaved(payload: Payload, savedPath: string): void {
    const shellWindow = this.shell;
    if (!shellWindow || shellWindow.isDestroyed()) return;
    try {
      shellWindow.webContents.send('kryvex:capture:saved', {
        kind: payload.kind,
        name: path.basename(savedPath),
        path: savedPath,
        bytes: payload.bytes,
        width: payload.width,
        height: payload.height,
        target: payload.target,
      });
    } catch {
      /* the shell is closing */
    }
  }

  private isPreview(event: IpcMainInvokeEvent): boolean {
    return Boolean(this.win && !this.win.isDestroyed() && event.sender === this.win.webContents);
  }

  private discardPayload(): void {
    const payload = this.payload;
    this.payload = null;
    if (!payload) return;
    try {
      fs.rmSync(payload.file, { force: true });
    } catch {
      /* the temp file is swept later */
    }
  }

  /** Old payloads belong to windows that are gone; nothing references them. */
  private sweep(dir: string): void {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!/\.(png|webm)$/i.test(name)) continue;
        const file = path.join(dir, name);
        const stat = fs.statSync(file);
        if (Date.now() - stat.mtimeMs > STALE_MS) fs.rmSync(file, { force: true });
      }
    } catch {
      /* a missing or locked directory is not worth failing an open over */
    }
  }
}

export const captureWindow = new CaptureWindow();
