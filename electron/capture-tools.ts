import { app, clipboard, ClipboardItem, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  captureFileName,
  captureLimit,
  decodeCapture,
  MAX_SHOT_BYTES,
} from './capture-rules';

/**
 * Where a capture goes.
 *
 * The renderer produces the pixels and never touches the filesystem: it hands
 * over base64, this writes it, and the user chooses the folder in a normal save
 * dialog that opens in `Downloads\Kryvex Captures`. A capture is a file the user
 * asked for, so there is no silent write and no default path they did not see.
 */

export interface CaptureSaveResult {
  ok: boolean;
  path?: string;
  cancelled?: boolean;
  message?: string;
}

function kindOf(value: unknown): 'shot' | 'clip' {
  return value === 'clip' ? 'clip' : 'shot';
}

class CaptureTools {
  private win: BrowserWindow | null = null;

  attachWindow(win: BrowserWindow): void {
    this.win = win;
    win.once('closed', () => {
      if (this.win === win) this.win = null;
    });
  }

  /** `Downloads\Kryvex Captures`, created so the dialog opens on a real folder. */
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

  async save(request: { data?: unknown; name?: unknown; kind?: unknown }): Promise<CaptureSaveResult> {
    const kind = kindOf(request?.kind);
    const bytes = decodeCapture(request?.data, captureLimit(kind));
    if (!bytes) return { ok: false, message: 'The capture was empty or too large to write.' };

    const suggested = captureFileName(request?.name, kind);
    const options = {
      title: kind === 'clip' ? 'Save recording' : 'Save capture',
      defaultPath: path.join(this.folder(), suggested),
      filters:
        kind === 'clip'
          ? [{ name: 'WebM video', extensions: ['webm'] }]
          : [{ name: 'PNG image', extensions: ['png'] }],
      properties: ['createDirectory' as const, 'showOverwriteConfirmation' as const],
    };
    const picked =
      this.win && !this.win.isDestroyed()
        ? await dialog.showSaveDialog(this.win, options)
        : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { ok: false, cancelled: true };

    // The dialog's filter is a hint: a typed name can still arrive without the
    // extension the file needs to be openable.
    const target = new RegExp(`\\.(${kind === 'clip' ? 'webm' : 'png'})$`, 'i').test(picked.filePath)
      ? picked.filePath
      : `${picked.filePath}.${kind === 'clip' ? 'webm' : 'png'}`;
    try {
      fs.writeFileSync(target, bytes);
      return { ok: true, path: target };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'The capture could not be written.',
      };
    }
  }

  /**
   * Electron 44's clipboard is the async W3C-shaped one (`write([ClipboardItem])`):
   * `writeImage` is gone, so the PNG is handed over as a typed blob.
   */
  async copy(raw: unknown): Promise<boolean> {
    const bytes = decodeCapture(raw, MAX_SHOT_BYTES);
    if (!bytes) return false;
    try {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      await clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }

  reveal(raw: unknown): boolean {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1024) return false;
    if (!path.isAbsolute(raw)) return false;
    try {
      if (!fs.statSync(raw).isFile()) return false;
    } catch {
      return false;
    }
    shell.showItemInFolder(raw);
    return true;
  }
}

export const captureTools = new CaptureTools();
