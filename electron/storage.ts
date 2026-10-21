import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isAliveWindow } from './lifecycle';
import type { DownloadLocation, DownloadLocationResult } from './types';
import {
  defaultStorageConfig,
  mergeRoots,
  normalizeDir,
  sanitizeStorageConfig,
  torrentRootFor,
  type StorageConfig,
} from './storage-rules';

const STORAGE_FILE = 'kryvex-storage.json';
const MAX_STORAGE_FILE_BYTES = 64 * 1024;

let config: StorageConfig | null = null;
let initialized = false;
let choosing = false;

function configPath(): string {
  return path.join(app.getPath('userData'), STORAGE_FILE);
}

function defaultDownloadDir(): string {
  return path.resolve(app.getPath('downloads'));
}

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function insideRoot(root: string, target: string): boolean {
  const base = path.resolve(root);
  const value = path.resolve(target);
  if (pathKey(base) === pathKey(value)) return false;
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  return pathKey(value).startsWith(pathKey(prefix));
}

function readConfig(fallback: StorageConfig): StorageConfig {
  try {
    const file = configPath();
    if (!fs.existsSync(file) || fs.statSync(file).size > MAX_STORAGE_FILE_BYTES) {
      return fallback;
    }
    return sanitizeStorageConfig(JSON.parse(fs.readFileSync(file, 'utf8')), fallback);
  } catch {
    // A damaged config must never stop the app or move downloads silently.
    return fallback;
  }
}

function persist(): void {
  if (!config) return;
  let json: string;
  try {
    json = JSON.stringify(config);
  } catch {
    return;
  }
  if (json.length > MAX_STORAGE_FILE_BYTES) return;
  const target = configPath();
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

function buildLocation(): DownloadLocation {
  const current = config ?? defaultStorageConfig(defaultDownloadDir());
  return {
    path: current.downloadDir,
    torrentPath: torrentRootFor(current.downloadDir),
    isDefault: pathKey(current.downloadDir) === pathKey(defaultDownloadDir()),
  };
}

/** Load the persisted location once, before downloads and torrents start. */
export function initStorage(): DownloadLocation {
  if (initialized) return buildLocation();
  const defaults = defaultStorageConfig(defaultDownloadDir());
  config = readConfig(defaults);
  initialized = true;
  persist();
  return buildLocation();
}

export function downloadLocation(): DownloadLocation {
  initStorage();
  return buildLocation();
}

export function managedDownloadRoots(): string[] {
  initStorage();
  return [...(config?.downloadRoots ?? [])];
}

export function managedTorrentRoots(): string[] {
  initStorage();
  return [...(config?.torrentRoots ?? [])];
}

export function torrentRoot(): string {
  initStorage();
  return torrentRootFor(config?.downloadDir ?? defaultDownloadDir());
}

export function isManagedDownloadPath(target: string): boolean {
  return managedDownloadRoots().some(root => insideRoot(root, target));
}

export function isManagedTorrentPath(target: string): boolean {
  return managedTorrentRoots().some(root => insideRoot(root, target));
}

function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) throw new Error('That path is not a folder.');
  fs.accessSync(dir, fs.constants.W_OK);
}

/**
 * Apply a new location immediately. New downloads and new torrents use it;
 * records that already exist keep their real paths and remain manageable
 * through the retained root list.
 */
export function setDownloadLocation(value: string): DownloadLocation {
  initStorage();
  const dir = normalizeDir(value);
  if (!dir) throw new Error('Choose an absolute folder path.');
  ensureDirectory(dir);
  const current = config ?? defaultStorageConfig(defaultDownloadDir());
  config = {
    version: 1,
    downloadDir: dir,
    downloadRoots: mergeRoots(current.downloadRoots, [dir]),
    torrentRoots: mergeRoots(current.torrentRoots, [torrentRootFor(dir)]),
  };
  persist();
  return buildLocation();
}

export async function chooseDownloadLocation(
  parent: BrowserWindow,
): Promise<DownloadLocationResult> {
  const location = downloadLocation();
  if (!isAliveWindow(parent)) {
    return { ok: false, message: 'The main window is not ready.', location };
  }
  if (choosing) {
    return { ok: false, message: 'The folder picker is already open.', location };
  }
  choosing = true;
  try {
    const picked = await dialog.showOpenDialog(parent, {
      title: 'Choose a download folder',
      defaultPath: location.path,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, message: 'Selection cancelled.', location: downloadLocation() };
    }
    return {
      ok: true,
      message: 'Download location updated.',
      location: setDownloadLocation(picked.filePaths[0] as string),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message
          ? error.message.slice(0, 240)
          : 'The download folder could not be changed.',
      location: downloadLocation(),
    };
  } finally {
    choosing = false;
  }
}

export function resetDownloadLocation(): DownloadLocationResult {
  try {
    return {
      ok: true,
      message: 'Download location reset to the Downloads folder.',
      location: setDownloadLocation(defaultDownloadDir()),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message
          ? error.message.slice(0, 240)
          : 'The download folder could not be reset.',
      location: downloadLocation(),
    };
  }
}
