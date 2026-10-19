import type { DownloadRecord, DownloadState } from './types';

export const MAX_DOWNLOAD_RECORDS = 200;

const STATES: ReadonlySet<DownloadState> = new Set([
  'progressing',
  'paused',
  'completed',
  'cancelled',
  'interrupted',
]);

const TERMINAL: ReadonlySet<DownloadState> = new Set([
  'completed',
  'cancelled',
  'interrupted',
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * Download records are display data, but they still come from a file a user
 * can edit. Keep only well-formed entries, restore their creation order, and
 * turn any download that was live when the app stopped into an interrupted
 * record instead of pretending it is still running.
 */
export function sanitizeDownloadRecords(raw: unknown): DownloadRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: DownloadRecord[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!record(item)) continue;
    const id = String(item.id ?? '');
    if (!/^dl-[a-z0-9-]{1,80}$/i.test(id) || seen.has(id)) continue;
    const filename = String(item.filename ?? '').trim().slice(0, 200);
    if (!filename) continue;
    const state = STATES.has(item.state as DownloadState)
      ? (item.state as DownloadState)
      : 'interrupted';
    const startedAt = Number(item.startedAt);
    const updatedAt = Number(item.updatedAt);
    seen.add(id);
    records.push({
      id,
      filename,
      url: String(item.url ?? '').slice(0, 2048),
      savePath: String(item.savePath ?? '').slice(0, 4096),
      receivedBytes: count(item.receivedBytes),
      totalBytes: count(item.totalBytes),
      state: TERMINAL.has(state) ? state : 'interrupted',
      startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    });
    if (records.length >= MAX_DOWNLOAD_RECORDS) break;
  }
  return records;
}
