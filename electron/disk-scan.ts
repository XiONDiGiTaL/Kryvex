import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  cleanupTargets,
  isOldEnough,
  isProtectedPath,
  matchesPrefix,
  protectedRoots,
  type DiskTargetSpec,
} from './disk-rules';

/**
 * The read-only half of Disk pulse: drive health, the analyzer and the sizing
 * pass behind the cleanup list.
 *
 * This module is deliberately free of Electron imports so the whole scan can
 * run inside a worker thread (`disk-scan-worker.ts`). A full-drive walk moves
 * hundreds of thousands of directory entries; keeping it off the main process
 * means the window, IPC and every other service stay responsive while it runs.
 *
 * Nothing here deletes anything. The cleaner stays in disk-service and re-checks
 * each file against disk-rules immediately before `unlink`.
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

/** What the worker sends back; the main process adds health and a timestamp. */
export interface DiskScanPayload {
  ok: boolean;
  targets: DiskTargetResult[];
  folders: DiskFolderEntry[];
  cancelled: boolean;
  message?: string;
}

export const SCAN_BUDGET_MS = 20_000;
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

export function driveRoot(): string {
  const homeRoot = path.parse(os.homedir()).root;
  return homeRoot || process.env.SystemDrive || 'C:\\';
}

export function safeMessage(error: unknown): string {
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

export type WalkOptions = {
  minAgeHours?: number;
  filePrefixes?: string[];
  deadline: number;
  signal: AbortSignal;
};

type WalkTotals = { bytes: number; files: number; skipped: number; truncated: boolean };

/**
 * Calls `onFile` for every regular file under `root` that passes the filters.
 * Exported for the cleaner, which reuses the walk but deletes instead of counting.
 */
export async function walkFiles(
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

async function measureTarget(
  spec: DiskTargetSpec,
  signal: AbortSignal,
  deadline: number,
): Promise<DiskTargetResult> {
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
      /* a missing cache is normal: that program was never used */
    }
  }

  return {
    id: spec.id,
    label: spec.label,
    detail: spec.detail,
    risk: spec.risk,
    bytes,
    fileCount,
    available,
    selectedByDefault: spec.selectedByDefault,
    requiresElevation: spec.requiresElevation,
  };
}

/**
 * One complete read-only pass. The worker calls this and posts the payload; the
 * same function is what tests can exercise without spawning a thread.
 */
export async function scanDisk(options: {
  budgetMs: number;
  signal: AbortSignal;
  /** Skip the drive-level analyzer; callers that only need totals can opt out. */
  driveFolders?: boolean;
}): Promise<DiskScanPayload> {
  const deadline = Date.now() + options.budgetMs;
  const { signal } = options;
  try {
    const targets = await mapLimit(cleanupTargets(), 2, (spec) =>
      measureTarget(spec, signal, deadline),
    );
    const folders =
      signal.aborted || options.driveFolders === false
        ? []
        : await readFolders(signal, deadline);
    return { ok: true, targets, folders, cancelled: signal.aborted };
  } catch (error) {
    return {
      ok: false,
      targets: [],
      folders: [],
      cancelled: signal.aborted,
      message: safeMessage(error),
    };
  }
}
