import { parentPort, workerData } from 'node:worker_threads';
import { SCAN_BUDGET_MS, safeMessage, scanDisk, type DiskScanPayload } from './disk-scan';

/**
 * Worker entry for a Disk pulse scan.
 *
 * The main process spawns one of these per scan and terminates it afterwards.
 * Isolation is the point: a deep walk of a full drive is CPU- and IO-bound, and
 * running it here keeps the window, IPC and every other service responsive.
 *
 * The worker only ever reads. It cannot delete, because the cleaner never leaves
 * the main process and the renderer never sends paths.
 */

type StartData = { budgetMs?: number };

const data = (workerData ?? {}) as StartData;
const budgetMs =
  typeof data.budgetMs === 'number' && Number.isFinite(data.budgetMs) && data.budgetMs > 0
    ? data.budgetMs
    : SCAN_BUDGET_MS;

const controller = new AbortController();

if (parentPort) {
  const port = parentPort;
  port.on('message', (message: unknown) => {
    if (message && typeof message === 'object' && (message as { type?: unknown }).type === 'cancel') {
      controller.abort();
    }
  });

  void scanDisk({ budgetMs, signal: controller.signal })
    .then((payload) => port.postMessage({ type: 'result', payload }))
    .catch((error: unknown) => {
      const failed: DiskScanPayload = {
        ok: false,
        targets: [],
        folders: [],
        cancelled: controller.signal.aborted,
        message: safeMessage(error),
      };
      port.postMessage({ type: 'result', payload: failed });
    });
}
