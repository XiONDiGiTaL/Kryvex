/**
 * The emulator's folders: one the user picked for cartridges, one for BIOS
 * files.
 *
 * Kryvex ships no games and no BIOS images, and that does not change here. What
 * this adds is a way to point the emulator at a folder the user already has, so
 * a cartridge can be loaded from a list instead of through a file dialog every
 * time. The desktop app can read a directory; the browser build cannot, and
 * says so rather than pretending.
 *
 * Two rules keep the new reach small:
 *
 * - A folder enters the owned set only through a native dialog, so the renderer
 *   cannot name a path.
 * - A read is refused unless the path resolves inside a folder that was picked,
 *   which is what stops this from becoming an arbitrary file reader.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';

/** Big enough for a CD image, small enough that a mistake cannot fill memory. */
export const MAX_LIBRARY_READ_BYTES = 768 * 1024 * 1024;
/** A folder with more files than this is a drive, not a game collection. */
export const MAX_LIBRARY_FILES = 4000;
/** How deep below the picked folder a file may sit (system subfolders). */
export const MAX_LIBRARY_DEPTH = 3;

export type LibraryKind = 'roms' | 'bios';

export interface LibraryFile {
  /** The file name alone; the panel shows this, never the path. */
  name: string;
  /** Where the file is. Used only to read it back through this module. */
  path: string;
  size: number;
}

export interface LibraryListing {
  ok: boolean;
  kind: LibraryKind;
  /** The folder's own name, for the panel; empty until something is picked. */
  folder: string;
  files: LibraryFile[];
  /** True when the cap was reached, so the panel can say the list is partial. */
  truncated: boolean;
  code?: 'cancelled' | 'unreadable';
}

export interface LibraryRead {
  ok: boolean;
  name: string;
  bytes?: Uint8Array;
  code?: 'not-picked' | 'too-large' | 'unreadable';
}

export function isLibraryKind(value: unknown): value is LibraryKind {
  return value === 'roms' || value === 'bios';
}

/**
 * Whether `candidate` really sits inside `folder`.
 *
 * `path.relative` is the check rather than a string prefix: it resolves `..`
 * and separators, so `/games-elsewhere` cannot pass as `/games`.
 */
export function isInsideFolder(folder: string, candidate: string): boolean {
  if (!folder || !candidate) return false;
  const relative = path.relative(folder, candidate);
  if (!relative || relative.startsWith('..')) return false;
  return !path.isAbsolute(relative);
}

/** The files in one folder, depth-limited, with the cap applied. */
export function scanFolder(folder: string): { files: LibraryFile[]; truncated: boolean } {
  const files: LibraryFile[] = [];
  let truncated = false;

  const walk = (directory: string, depth: number): void => {
    if (truncated || depth > MAX_LIBRARY_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_LIBRARY_FILES) {
        truncated = true;
        return;
      }
      // Hidden entries are not a game library, and following a symlink can walk
      // out of the folder that was picked.
      if (entry.name.startsWith('.')) continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = fs.statSync(full);
        files.push({ name: entry.name, path: full, size: stat.size });
      } catch {
        /* a file that vanished mid-scan is simply not listed */
      }
    }
  };

  walk(folder, 0);
  return { files, truncated };
}

/** The two picked folders, held for the life of the app. */
export class EmulatorLibrary {
  private folders: Record<LibraryKind, string> = { roms: '', bios: '' };

  constructor(private readonly parent: () => BrowserWindow | null) {}

  private listing(kind: LibraryKind): LibraryListing {
    const folder = this.folders[kind];
    if (!folder) {
      return { ok: false, kind, folder: '', files: [], truncated: false, code: 'unreadable' };
    }
    const { files, truncated } = scanFolder(folder);
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, kind, folder: path.basename(folder), files, truncated };
  }

  /** What is already known, without opening a dialog. */
  read(kind: unknown): LibraryListing {
    return this.listing(isLibraryKind(kind) ? kind : 'roms');
  }

  /** Opens the picker, then lists what is in the folder chosen. */
  async pick(kind: unknown): Promise<LibraryListing> {
    const which: LibraryKind = isLibraryKind(kind) ? kind : 'roms';
    const options: OpenDialogOptions = {
      title: which === 'roms' ? 'Choose your games folder' : 'Choose your BIOS folder',
      properties: ['openDirectory'],
    };
    const window = this.parent();
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const folder = picked.canceled ? '' : picked.filePaths[0];
    if (!folder) {
      return { ok: false, kind: which, folder: this.folders[which] ? path.basename(this.folders[which]) : '', files: [], truncated: false, code: 'cancelled' };
    }
    this.folders[which] = folder;
    return this.listing(which);
  }

  /**
   * The bytes of one listed file.
   *
   * The path has to resolve inside a folder the user picked; the renderer can
   * pass any string, so this is the only guard between a click and the disk.
   */
  readFile(target: unknown): LibraryRead {
    const file = typeof target === 'string' ? target : '';
    if (!file) return { ok: false, name: '', code: 'not-picked' };
    const resolved = path.resolve(file);
    const owned = Object.values(this.folders).some(folder => isInsideFolder(folder, resolved));
    if (!owned) return { ok: false, name: path.basename(resolved), code: 'not-picked' };
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return { ok: false, name: path.basename(resolved), code: 'unreadable' };
      if (stat.size > MAX_LIBRARY_READ_BYTES) {
        return { ok: false, name: path.basename(resolved), code: 'too-large' };
      }
      return { ok: true, name: path.basename(resolved), bytes: fs.readFileSync(resolved) };
    } catch {
      return { ok: false, name: path.basename(resolved), code: 'unreadable' };
    }
  }
}
