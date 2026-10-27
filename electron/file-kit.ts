import { app, BrowserWindow, clipboard, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_FILE_BYTES,
  MAX_PICK_BYTES,
  MAX_PICK_FILES,
  MAX_WRITE_BYTES,
  decodeBase64,
  extOf,
  filtersFor,
  isPlainFileName,
  kindOfExtension,
  sniffKind,
  uniqueName,
  type FileKind,
  type FilePickResult,
  type FileRenameResult,
  type FileSaveResult,
  type PickedFile,
  type WrittenFile,
} from './file-kit-rules';

/**
 * The file boundary for Kryvex's own tools.
 *
 * File Forge and Canvas transform files locally, in the renderer, where the
 * codecs are. This object is the only thing that touches the disk on their
 * behalf, and it holds three lines it will not cross:
 *
 * - every path crosses a native dialog first, so the user chose it;
 * - every payload is sniffed against its own magic number before it is written;
 * - renaming is refused for any path this process has not itself handed out in a
 *   pick, so a compromised renderer cannot nominate a file to move.
 *
 * `picked` is the memory that makes the third point true. It is per-session on
 * purpose: it costs nothing to re-pick a file, and it means a stale renderer
 * from a previous run has no standing.
 */
class FileKit {
  private win: BrowserWindow | null = null;
  private picked = new Map<string, FileKind>();

  attachWindow(win: BrowserWindow): void {
    this.win = win;
    win.once('closed', () => {
      if (this.win === win) this.win = null;
    });
  }

  private parent(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  private folder(): string {
    try {
      return path.join(app.getPath('documents'), 'Kryvex Exports');
    } catch {
      return app.getPath('downloads');
    }
  }

  /** True once this process has handed the renderer this exact path. */
  owns(filePath: string): boolean {
    return this.picked.has(filePath);
  }

  async pick(request: unknown): Promise<FilePickResult> {
    const source = (request ?? {}) as { kind?: unknown; multiple?: unknown };
    const kind: FileKind =
      source.kind === 'pdf' ? 'pdf' : source.kind === 'data' ? 'data' : 'image';
    const multiple = source.multiple !== false;
    const window = this.parent();
    const options: Electron.OpenDialogOptions = {
      title: kind === 'image' ? 'Choose images' : kind === 'pdf' ? 'Choose PDF files' : 'Choose files',
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: filtersFor(kind),
    };
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, files: [], cancelled: true };
    }

    const files: PickedFile[] = [];
    let total = 0;
    for (const file of picked.filePaths.slice(0, MAX_PICK_FILES)) {
      const name = path.basename(file);
      const fileKind = kindOfExtension(name) ?? kind;
      let bytes: Buffer;
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) continue;
        if (stat.size > MAX_FILE_BYTES) {
          return { ok: false, files: [], code: 'too-big', detail: name };
        }
        bytes = fs.readFileSync(file);
      } catch {
        return { ok: false, files: [], code: 'read-failed', detail: name };
      }
      total += bytes.length;
      if (total > MAX_PICK_BYTES) {
        return { ok: false, files: [], code: 'too-many-bytes' };
      }
      const sniffed = sniffKind(bytes);
      this.picked.set(file, fileKind);
      files.push({
        name,
        path: file,
        size: bytes.length,
        kind: sniffed === 'pdf' ? 'pdf' : fileKind,
        data: bytes.toString('base64'),
      });
    }
    if (files.length === 0) return { ok: false, files: [], code: 'no-readable-file' };
    return { ok: true, files };
  }

  /**
   * Writes converted copies. One item gets the usual save dialog with its own
   * name; several get a folder, because forty dialogs is not a workflow.
   */
  async save(request: unknown): Promise<FileSaveResult> {
    const source = (request ?? {}) as { items?: unknown };
    const raw = Array.isArray(source.items) ? source.items : [];
    const items: { name: string; bytes: Buffer }[] = [];
    for (const entry of raw.slice(0, MAX_PICK_FILES)) {
      const item = (entry ?? {}) as { name?: unknown; data?: unknown };
      const name = typeof item.name === 'string' ? item.name : '';
      const ext = extOf(name);
      const kind = kindOfExtension(name);
      if (!ext || !kind) return { ok: false, saved: [], code: 'no-extension', detail: name };
      const bytes = decodeBase64(item.data, MAX_WRITE_BYTES);
      if (!bytes) return { ok: false, saved: [], code: 'empty-or-large', detail: name };
      const sniffed = sniffKind(bytes);
      const expected = kind === 'image' ? 'image' : kind === 'pdf' ? 'pdf' : 'data';
      // A PNG that is not a PNG would be written under a name that lies about
      // it, which is worse than refusing the export.
      if (sniffed !== expected && !(expected === 'data' && sniffed === 'kxcanvas')) {
        return { ok: false, saved: [], code: 'format-mismatch', detail: name };
      }
      items.push({ name, bytes });
    }
    if (items.length === 0) return { ok: false, saved: [], code: 'nothing-to-export' };

    const written: WrittenFile[] = [];
    const taken = new Set<string>();
    if (items.length === 1) {
      const only = items[0]!;
      const window = this.parent();
      const options: Electron.SaveDialogOptions = {
        title: 'Export a copy',
        defaultPath: path.join(this.folder(), only.name),
        filters: [{ name: `${extOf(only.name).toUpperCase()} file`, extensions: [extOf(only.name)] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      };
      const target = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (target.canceled || !target.filePath) return { ok: false, saved: [], cancelled: true };
      const filePath = extOf(target.filePath) ? target.filePath : `${target.filePath}.${extOf(only.name)}`;
      try {
        fs.writeFileSync(filePath, only.bytes);
      } catch {
        return { ok: false, saved: [], code: 'write-failed' };
      }
      return {
        ok: true,
        saved: [{ name: path.basename(filePath), path: filePath, size: only.bytes.length }],
      };
    }

    const window = this.parent();
    const folderPick = window
      ? await dialog.showOpenDialog(window, {
          title: `Choose a folder for ${items.length} exports`,
          defaultPath: this.folder(),
          properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
        })
      : await dialog.showOpenDialog({
          title: `Choose a folder for ${items.length} exports`,
          properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
        });
    const folder = folderPick.canceled ? '' : folderPick.filePaths[0];
    if (!folder) return { ok: false, saved: [], cancelled: true };
    try {
      fs.mkdirSync(folder, { recursive: true });
      for (const item of items) {
        const name = uniqueName(item.name, taken);
        const target = path.join(folder, name);
        fs.writeFileSync(target, item.bytes);
        written.push({ name, path: target, size: item.bytes.length });
      }
    } catch {
      return { ok: false, saved: written, code: 'write-failed' };
    }
    return { ok: true, saved: written };
  }

  /**
   * Renames files that were picked in this session, in place.
   *
   * The preview the renderer shows is only a preview: this recomputes nothing
   * and trusts nothing except that the new name is a plain file name and the
   * folder is the one the file already lives in. Nothing is overwritten.
   */
  async rename(request: unknown): Promise<FileRenameResult> {
    const source = (request ?? {}) as { items?: unknown };
    const raw = Array.isArray(source.items) ? source.items : [];
    if (raw.length === 0) return { ok: true, renamed: [] };
    const plan: { from: string; to: string }[] = [];
    for (const entry of raw.slice(0, MAX_PICK_FILES)) {
      const item = (entry ?? {}) as { path?: unknown; name?: unknown };
      const from = typeof item.path === 'string' ? item.path : '';
      const name = item.name;
      if (!this.owns(from)) {
        return { ok: false, renamed: [], code: 'not-picked' };
      }
      if (!isPlainFileName(name)) {
        return { ok: false, renamed: [], code: 'bad-name', detail: String(name ?? '') };
      }
      const to = path.join(path.dirname(from), name);
      if (to === from) continue;
      if (plan.some(item => item.to.toLowerCase() === to.toLowerCase())) {
        return { ok: false, renamed: [], code: 'duplicate-name', detail: name };
      }
      plan.push({ from, to });
    }

    // A rename is all-or-nothing: a name that is already taken stops the whole
    // batch before anything moves, so a failure cannot leave half a set renamed.
    for (const item of plan) {
      try {
        if (fs.existsSync(item.to)) {
          return { ok: false, renamed: [], code: 'target-exists', detail: path.basename(item.to) };
        }
      } catch {
        return { ok: false, renamed: [], code: 'read-failed', detail: path.basename(item.to) };
      }
    }

    const renamed: { from: string; to: string }[] = [];
    for (const item of plan) {
      try {
        fs.renameSync(item.from, item.to);
      } catch {
        return { ok: false, renamed, code: 'write-failed', detail: path.basename(item.from) };
      }
      const kind = this.picked.get(item.from) ?? 'data';
      this.picked.delete(item.from);
      this.picked.set(item.to, kind);
      renamed.push(item);
    }
    return { ok: true, renamed };
  }

  copyText(text: unknown): boolean {
    if (typeof text !== 'string' || text.length === 0 || text.length > 200_000) return false;
    clipboard.writeText(text);
    return true;
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

export const fileKit = new FileKit();
