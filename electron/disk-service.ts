import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  checkDeletable,
  cleanupTargets,
  isOldEnough,
  isProtectedPath,
  matchesPrefix,
  protectedRoots,
  targetById,
  type DiskTargetSpec,
} from './disk-rules';

/**
 * The scanner and cleaner behind the Disk pulse view.
 *
 * Scanning is read-only and can be cancelled from the UI at any time. Cleaning
 * only removes files that the rules module approves: the renderer sends target
 * ids, the roots and filters come from disk-rules, and every file is re-checked
 * against the protected list immediately before `unlink`. Links are never
 * followed, so a junction inside a cache cannot redirect a delete.
 *
 * The scan runs in the main process with a time budget and bounded concurrency,
 * so a full drive does not freeze the window.
 */

export interface DiskHealth {
  available: boolean;
  drive: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  checkedAt: number;
  message?: string;
}

export interface DiskTargetResult {
  id: string;
  label: string;
  detail: string;
  risk: DiskTargetSpec['risk'];
  bytes: number;
  fileCount: number;
  available: boolean;
  selectedByDefault: boolean;
  requiresElevation: boolean;
}

export interface DiskFolderEntry {
  name: string;
  path: string;
  bytes: number;
  directory: boolean;
}

export interface DiskScanResult {
  ok: boolean;
  health: DiskHealth;
  targets: DiskTargetResult[];
  folders: DiskFolderEntry[];
  scannedAt: number;
  cancelled: boolean;
  message?: string;
}

export interface DiskCleanResult {
  ok: boolean;
  freedBytes: number;
  removedFiles: number;
  skipped: number;
  targets: Array<{ id: string; label: string; bytes: number; removed: number }>;
  errors: string[];
  cancelled: boolean;
  message?: string;
}

const SCAN_BUDGET_MS = 20_000;
const FILE_CONCURRENCY = 48;
const MAX_ERROR_TEXT = 160;

/** Names that are not interesting in a drive-level breakdown. */
const SKIP_DRIVE_ENTRIES = new Set([
  '$recycle.bin',
  'system volume information',
  'config.msi',
  'recovery',
  '$winreagent',
  'pagefile.sys',
  'hiberfil.sys',
  'swapfile.sys',
  'dumpstack.log.tmp',
]);

function driveRoot(): string {
  const homeRoot = path.parse(os.homedir()).root;
  return homeRoot || process.env.SystemDrive || 'C:\\';
}

function safeMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT)}…` : text;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) break;
      results[index] = await worker(item);
    }
  });
  await Promise.all(runners);
  return results;
}

type WalkOptions = {
  minAgeHours?: number;
  filePrefixes?: string[];
  deadline: number;
  signal: AbortSignal;
};

type WalkTotals = { bytes: number; files: number; skipped: number; truncated: boolean };

/** Calls `onFile` for every regular file under `root` that passes the filters. */
async function walkFiles(
  root: string,
  options: WalkOptions,
  onFile: (file: string, size: number, mtimeMs: number) => Promise<void>,
): Promise<WalkTotals> {
  const totals: WalkTotals = { bytes: 0, files: 0, skipped: 0, truncated: false };
  const protectedList = protectedRoots();
  const stack: string[] = [root];
  const now = Date.now();

  while (stack.length > 0) {
    if (options.signal.aborted || Date.now() > options.deadline) {
      totals.truncated = true;
      break;
    }
    const dir = stack.pop();
    if (!dir) break;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      totals.skipped += 1;
      continue;
    }

    // Filesystem order is arbitrary; split so files are stat'ed in parallel
    // while subdirectories are queued for later.
    const files: fs.Dirent[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        totals.skipped += 1;
        continue;
      }
      if (entry.isDirectory()) {
        const child = path.join(dir, entry.name);
        if (!isProtectedPath(child, protectedList)) stack.push(child);
        continue;
      }
      if (!entry.isFile()) continue;
      if (options.filePrefixes && !matchesPrefix(entry.name, options.filePrefixes)) continue;
      files.push(entry);
    }

    await mapLimit(files, FILE_CONCURRENCY, async (entry) => {
      const file = path.join(dir, entry.name);
      if (isProtectedPath(file, protectedList)) {
        totals.skipped += 1;
        return;
      }
      try {
        const stat = await fsp.lstat(file);
        if (!stat.isFile()) return;
        if (!isOldEnough(stat.mtimeMs, now, options.minAgeHours)) return;
        await onFile(file, stat.size, stat.mtimeMs);
        totals.bytes += stat.size;
        totals.files += 1;
      } catch {
        totals.skipped += 1;
      }
    });
  }
  return totals;
}

/** Free space and usage for the drive holding the user profile. */
export async function readHealth(): Promise<DiskHealth> {
  const drive = driveRoot();
  try {
    const stats = await fsp.statfs(drive);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      available: true,
      drive,
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0,
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      available: false,
      drive,
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      usedPercent: 0,
      checkedAt: Date.now(),
      message: safeMessage(error),
    };
  }
}

/**
 * Sizes of the drive's top-level entries, so the view can draw bars that mean
 * something without a second analyzer binary. Bounded by the scan deadline.
 */
async function readFolders(signal: AbortSignal, deadline: number): Promise<DiskFolderEntry[]> {
  const root = driveRoot();
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates = entries.filter(
    (entry) =>
      entry.isDirectory() &&
      !entry.isSymbolicLink() &&
      !SKIP_DRIVE_ENTRIES.has(entry.name.toLowerCase()),
  );

  const measured = await mapLimit(candidates, 6, async (entry) => {
    const full = path.join(root, entry.name);
    const totals = await walkFiles(
      full,
      { deadline, signal },
      async () => {
        /* analyzer only needs totals */
      },
    );
    return { name: entry.name, path: full, bytes: totals.bytes, directory: true };
  });

  return measured
    .filter((entry) => entry.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8);
}

async function measureTarget(spec: DiskTargetSpec, signal: AbortSignal, deadline: number) {
  let bytes = 0;
  let fileCount = 0;
  let available = false;

  for (const root of spec.roots) {
    if (signal.aborted) break;
    try {
      const stat = await fsp.lstat(root);
      if (stat.isSymbolicLink()) continue;
      available = true;
      if (stat.isDirectory()) {
        const totals = await walkFiles(
          root,
          {
            minAgeHours: spec.minAgeHours,
            filePrefixes: spec.filePrefixes,
            deadline,
            signal,
          },
          async () => {
            /* sized by walkFiles */
          },
        );
        bytes += totals.bytes;
        fileCount += totals.files;
      } else if (stat.isFile() && matchesPrefix(path.basename(root), spec.filePrefixes)) {
        if (isOldEnough(stat.mtimeMs, Date.now(), spec.minAgeHours)) {
          bytes += stat.size;
          fileCount += 1;
        }
      }
    } catch {
      /* a missing cache is normal: it means that program was never used */
    }
  }
  return { bytes, fileCount, available };
}

class DiskService {
  private controller: AbortController | null = null;
  private busy = false;

  /** Cheap enough to call on mount; it does not walk any folder. */
  health(): Promise<DiskHealth> {
    return readHealth();
  }

  /** Starts a scan; a second call returns the running one's fallback. */
  async scan(): Promise<DiskScanResult> {
    const health = await readHealth();
    if (this.busy) {
      return {
        ok: false,
        health,
        targets: [],
        folders: [],
        scannedAt: Date.now(),
        cancelled: true,
        message: 'A scan is already running.',
      };
    }
    this.busy = true;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const deadline = Date.now() + SCAN_BUDGET_MS;
    const specs = cleanupTargets();

    try {
      const targetResults = await mapLimit(specs, 2, async (spec) => {
        const measured = await measureTarget(spec, signal, deadline);
        return {
          id: spec.id,
          label: spec.label,
          detail: spec.detail,
          risk: spec.risk,
          bytes: measured.bytes,
          fileCount: measured.fileCount,
          available: measured.available,
          selectedByDefault: spec.selectedByDefault,
          requiresElevation: spec.requiresElevation,
        } satisfies DiskTargetResult;
      });

      const folders = signal.aborted ? [] : await readFolders(signal, deadline);

      return {
        ok: true,
        health,
        targets: targetResults,
        folders,
        scannedAt: Date.now(),
        cancelled: signal.aborted,
      };
    } catch (error) {
      return {
        ok: false,
        health,
        targets: [],
        folders: [],
        scannedAt: Date.now(),
        cancelled: signal.aborted,
        message: safeMessage(error),
      };
    } finally {
      this.busy = false;
      this.controller = null;
    }
  }

  cancel(): boolean {
    if (!this.controller) return false;
    this.controller.abort();
    return true;
  }

  /**
   * Cleans the given target ids. Re-reads the specs from disk-rules so a stale
   * renderer cannot widen the scope, and re-checks every file before deleting.
   */
  async clean(ids: unknown): Promise<DiskCleanResult> {
    const empty: DiskCleanResult = {
      ok: false,
      freedBytes: 0,
      removedFiles: 0,
      skipped: 0,
      targets: [],
      errors: [],
      cancelled: false,
    };
    if (!Array.isArray(ids)) return { ...empty, message: 'No cleanup targets selected.' };
    const wanted = Array.from(
      new Set(ids.filter((id): id is string => typeof id === 'string' && id.length <= 64)),
    );
    const specs = wanted.map((id) => targetById(id)).filter((spec): spec is DiskTargetSpec => spec !== null);
    if (specs.length === 0) return { ...empty, message: 'Those cleanup targets are not recognised.' };
    if (specs.some((spec) => spec.requiresElevation)) {
      return { ...empty, message: 'That target needs an elevated helper and is not available yet.' };
    }

    this.controller = new AbortController();
    const signal = this.controller.signal;
    const deadline = Date.now() + 60_000;
    const protectedList = protectedRoots();
    const result: DiskCleanResult = {
      ok: true,
      freedBytes: 0,
      removedFiles: 0,
      skipped: 0,
      targets: [],
      errors: [],
      cancelled: false,
    };

    try {
      for (const spec of specs) {
        let removed = 0;
        let bytes = 0;
        for (const root of spec.roots) {
          if (signal.aborted) break;
          let stat: fs.Stats;
          try {
            stat = await fsp.lstat(root);
          } catch {
            continue;
          }
          if (!stat.isDirectory() || stat.isSymbolicLink()) continue;

          // Every target is a directory: its own contents are the candidates,
          // and `filePrefixes` narrows that to specific cache files.
          const totals = await walkFiles(
            root,
            {
              minAgeHours: spec.minAgeHours,
              filePrefixes: spec.filePrefixes,
              deadline,
              signal,
            },
            async (file) => {
              const check = checkDeletable(root, file, protectedList);
              if (!check.ok) {
                result.skipped += 1;
                return;
              }
              try {
                const info = await fsp.lstat(file);
                if (!info.isFile() || info.isSymbolicLink()) {
                  result.skipped += 1;
                  return;
                }
                await fsp.unlink(file);
                removed += 1;
                bytes += info.size;
              } catch (error) {
                result.skipped += 1;
                if (result.errors.length < 6) result.errors.push(`${path.basename(file)}: ${safeMessage(error)}`);
              }
            },
          );
          result.skipped += totals.skipped;
        }
        result.freedBytes += bytes;
        result.removedFiles += removed;
        result.targets.push({ id: spec.id, label: spec.label, bytes, removed });
      }
      result.cancelled = signal.aborted;
      return result;
    } catch (error) {
      return { ...result, ok: false, message: safeMessage(error) };
    } finally {
      this.controller = null;
    }
  }
}

export const diskService = new DiskService();
