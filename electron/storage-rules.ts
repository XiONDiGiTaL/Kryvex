import path from 'node:path';

export const TORRENT_FOLDER = 'Kryvex Torrents';
export const MAX_STORAGE_ROOTS = 12;

export interface StorageConfig {
  version: 1;
  downloadDir: string;
  downloadRoots: string[];
  torrentRoots: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A download location must be an absolute, non-empty filesystem path. */
export function normalizeDir(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || trimmed.includes('\u0000')) return null;
  if (!path.isAbsolute(trimmed)) return null;
  return path.resolve(trimmed);
}

export function torrentRootFor(downloadDir: string): string {
  return path.join(downloadDir, TORRENT_FOLDER);
}

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

export function mergeRoots(candidates: unknown[], current: string[]): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [...current, ...candidates]) {
    const dir = normalizeDir(candidate);
    if (!dir) continue;
    const key = pathKey(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(dir);
    if (roots.length >= MAX_STORAGE_ROOTS) break;
  }
  return roots;
}

export function defaultStorageConfig(downloadDir: string): StorageConfig {
  const resolved = path.resolve(downloadDir);
  return {
    version: 1,
    downloadDir: resolved,
    downloadRoots: [resolved],
    torrentRoots: [torrentRootFor(resolved)],
  };
}

/**
 * The config is a plain local JSON file, so a hand-edited value must never
 * make the app write outside a folder it can actually use. Roots are kept so
 * downloads and torrents created before a location change remain manageable.
 */
export function sanitizeStorageConfig(raw: unknown, defaults: StorageConfig): StorageConfig {
  if (!isRecord(raw)) return defaults;
  const downloadDir = normalizeDir(raw.downloadDir) ?? defaults.downloadDir;
  return {
    version: 1,
    downloadDir,
    downloadRoots: mergeRoots(
      [downloadDir, ...(Array.isArray(raw.downloadRoots) ? raw.downloadRoots : [])],
      defaults.downloadRoots,
    ),
    torrentRoots: mergeRoots(
      [torrentRootFor(downloadDir), ...(Array.isArray(raw.torrentRoots) ? raw.torrentRoots : [])],
      defaults.torrentRoots,
    ),
  };
}
