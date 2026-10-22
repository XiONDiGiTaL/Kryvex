import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { checkDeletable, protectedRoots, targetById, type DiskTargetSpec } from './disk-rules';
import {
  readHealth,
  safeMessage,
  SCAN_BUDGET_MS,
  walkFiles,
  type DiskFolderEntry,
  type DiskHealth,
  type DiskScanPayload,
  type DiskTargetResult,
} from './disk-scan';

export type { DiskFolderEntry, DiskHealth, DiskTargetResult } from './disk-scan';

/**
 * The orchestrator behind the Disk pulse view.
 *
 * Scanning happens in a worker thread (`disk-scan-worker.ts`) so a full-drive
 * walk never competes with the main process: the window, IPC and every other
 * service keep answering while it runs. One worker per scan, terminated when the
 * scan settles or the user stops it.
 *
 * Cleaning stays on the main thread because it deletes: the renderer sends
 * target ids, the roots and filters come from disk-rules, and every file is
 * re-checked against the protected list immediately before `unlink`. Links are
 * never followed, so a junction inside a cache cannot redirect a delete.
 */

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

/** How long a cancelled worker has to report partial totals before it is killed. */
const CANCEL_GRACE_MS = 6_000;
/** A worker that outlives the scan budget by this much is treated as hung. */
const HARD_LIMIT_MS = SCAN_BUDGET_MS + 25_000;

/** Path of the compiled worker, emitted beside this file by tsc. */
function workerEntry(): string {
  const dir = typeof __dirname === 'string' ? __dirname : path.join(process.cwd(), 'dist-electron');
  return path.join(dir, 'disk-scan-worker.js');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The worker is our own code, but its payload still crosses a thread boundary
 * before it reaches the renderer, so it is rebuilt field by field: no unknown
 * keys, no NaN, no stray strings where a count belongs.
 */
function parsePayload(message: unknown): DiskScanPayload | null {
  if (!isRecord(message) || message.type !== 'result' || !isRecord(message.payload)) return null;
  const raw = message.payload;
  const targets: DiskTargetResult[] = Array.isArray(raw.targets)
    ? raw.targets.filter(isRecord).map((entry) => ({
        id: String(entry.id ?? ''),
        label: String(entry.label ?? ''),
        detail: String(entry.detail ?? ''),
        risk: entry.risk === 'caution' ? 'caution' : 'safe',
        bytes: finite(entry.bytes),
        fileCount: finite(entry.fileCount),
        available: entry.available === true,
        selectedByDefault: entry.selectedByDefault === true,
        requiresElevation: entry.requiresElevation === true,
      }))
    : [];
  const folders: DiskFolderEntry[] = Array.isArray(raw.folders)
    ? raw.folders.filter(isRecord).map((entry) => ({
        name: String(entry.name ?? ''),
        path: String(entry.path ?? ''),
        bytes: finite(entry.bytes),
        directory: entry.directory === true,
      }))
    : [];
  return {
    ok: raw.ok === true,
    targets,
    folders,
    cancelled: raw.cancelled === true,
    message: typeof raw.message === 'string' ? raw.message : undefined,
  };
}

function failedScan(message: string, cancelled = false): DiskScanPayload {
  return { ok: false, targets: [], folders: [], cancelled, message };
}

/** One worker thread running one scan, with the lifecycle the service needs. */
class ScanRun {
  readonly result: Promise<DiskScanPayload>;
  private worker: Worker | null = null;
  private settleResult!: (payload: DiskScanPayload) => void;
  private settled = false;
  private cancelRequested = false;
  private hardTimer: NodeJS.Timeout | null = null;
  private cancelTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.result = new Promise((resolve) => {
      this.settleResult = resolve;
    });

    let worker: Worker;
    try {
      worker = new Worker(workerEntry(), { workerData: { budgetMs: SCAN_BUDGET_MS } });
    } catch (error) {
      this.settle(failedScan(`The scan worker could not start: ${safeMessage(error)}`));
      return;
    }
    this.worker = worker;

    worker.on('message', (message: unknown) => {
      const payload = parsePayload(message);
      if (payload) this.settle(payload);
    });
    worker.on('error', (error) => {
      this.settle(failedScan(safeMessage(error), this.cancelRequested));
    });
    worker.on('exit', (code) => {
      this.settle(
        this.cancelRequested
          ? failedScan('The scan was stopped.', true)
          : failedScan(`The scan worker exited (${code}).`),
      );
      this.clearTimers();
    });

    this.hardTimer = setTimeout(() => {
      this.settle(failedScan('The scan worker stopped responding.'));
      this.terminate();
    }, HARD_LIMIT_MS);
    this.hardTimer.unref?.();
  }

  /** Asks the worker to stop; it reports partial totals unless it stalls. */
  requestCancel(): boolean {
    if (this.settled) return false;
    this.cancelRequested = true;
    this.worker?.postMessage({ type: 'cancel' });
    this.cancelTimer = setTimeout(() => {
      this.settle(failedScan('The scan was stopped.', true));
      this.terminate();
    }, CANCEL_GRACE_MS);
    this.cancelTimer.unref?.();
    return true;
  }

  /** Always safe to call; a finished worker is terminated and its timers cleared. */
  dispose(): void {
    this.clearTimers();
    this.terminate();
  }

  private settle(payload: DiskScanPayload): void {
    if (this.settled) return;
    this.settled = true;
    this.clearTimers();
    this.settleResult(payload);
  }

  private clearTimers(): void {
    if (this.hardTimer) {
      clearTimeout(this.hardTimer);
      this.hardTimer = null;
    }
    if (this.cancelTimer) {
      clearTimeout(this.cancelTimer);
      this.cancelTimer = null;
    }
  }

  private terminate(): void {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    void worker.terminate().catch(() => {
      /* already gone */
    });
  }
}

class DiskService {
  private scanning: ScanRun | null = null;
  private cleanController: AbortController | null = null;

  /** Cheap enough to call on mount; it does not walk any folder. */
  health(): Promise<DiskHealth> {
    return readHealth();
  }

  /** Starts a scan; a second call returns the running one's fallback. */
  async scan(): Promise<DiskScanResult> {
    if (this.scanning) {
      return {
        ok: false,
        health: await readHealth(),
        targets: [],
        folders: [],
        scannedAt: Date.now(),
        cancelled: true,
        message: 'A scan is already running.',
      };
    }
    // Claimed before the first await so two quick IPC calls cannot both spawn a
    // worker and walk the drive twice.
    const run = new ScanRun();
    this.scanning = run;
    try {
      const health = await readHealth();
      const payload = await run.result;
      return {
        ok: payload.ok,
        health,
        targets: payload.targets,
        folders: payload.folders,
        scannedAt: Date.now(),
        cancelled: payload.cancelled,
        message: payload.message,
      };
    } finally {
      run.dispose();
      this.scanning = null;
    }
  }

  cancel(): boolean {
    const stoppedScan = this.scanning ? this.scanning.requestCancel() : false;
    if (this.cleanController) {
      this.cleanController.abort();
      return true;
    }
    return stoppedScan;
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
    const specs = wanted
      .map((id) => targetById(id))
      .filter((spec): spec is DiskTargetSpec => spec !== null);
    if (specs.length === 0) return { ...empty, message: 'Those cleanup targets are not recognised.' };
    if (specs.some((spec) => spec.requiresElevation)) {
      return { ...empty, message: 'That target needs an elevated helper and is not available yet.' };
    }

    this.cleanController = new AbortController();
    const signal = this.cleanController.signal;
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
                if (result.errors.length < 6) {
                  result.errors.push(`${path.basename(file)}: ${safeMessage(error)}`);
                }
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
      this.cleanController = null;
    }
  }
}

export const diskService = new DiskService();
