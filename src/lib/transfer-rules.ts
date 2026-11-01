/**
 * Rooms file transfer rules.
 *
 * A transfer is a stream of chunks between two peers over the room's own WebRTC
 * data channels; no Kryvex service sees the bytes and nothing is uploaded. The
 * decisions that need no socket and no disk live here so the engine, the panel
 * and the tests share one definition of a safe name, a chunk plan and the
 * numbers the panel prints.
 */

/** Bytes in one chunk. A message this size fits every data channel comfortably. */
export const TRANSFER_CHUNK_BYTES = 256 * 1024;

/**
 * Chunks the sender may have in flight before the receiver has written one.
 *
 * Without a window a fast disk sits idle behind a full round trip, and without
 * a limit a slow disk is handed gigabytes of buffered chunks it cannot store.
 */
export const TRANSFER_WINDOW = 8;

export const MAX_TRANSFER_NAME = 180;
export const MAX_ACTIVE_TRANSFERS = 12;

export type TransferDirection = 'send' | 'receive';

export type TransferState =
  | 'offered'
  | 'waiting'
  | 'active'
  | 'done'
  | 'saved'
  | 'declined'
  | 'cancelled'
  | 'failed';

export interface TransferRow {
  id: string;
  direction: TransferDirection;
  /** The peer on the other end; empty while an offer is still broadcast. */
  peerId: string;
  name: string;
  size: number;
  /** Bytes handed over (send) or written to disk (receive). */
  done: number;
  state: TransferState;
  /** Where a received file landed, once the sink finished. */
  path?: string;
  /** A stable code, translated by the panel; never a sentence from the wire. */
  error?: string;
  /** Bytes per second, averaged since the transfer became active. */
  rate: number;
  startedAt: number;
  endedAt?: number;
}

export function newTransferId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let id = 'x';
  for (const byte of bytes) id += byte.toString(16).padStart(2, '0');
  return id;
}

/** Windows refuses these outright, whatever the extension. */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * The name a received file may be saved under.
 *
 * A peer chooses this string, so it is treated as hostile: directories are
 * dropped, characters Windows cannot store are removed, leading dots and
 * trailing dots or spaces go, and a reserved device name gets a prefix. The
 * extension survives the length cap, because a name without one is a file the
 * system cannot open.
 */
export function sanitizeTransferName(raw: unknown, fallback = 'file'): string {
  const text = typeof raw === 'string' ? raw : '';
  const base = text.split(/[\\/]/).pop() ?? '';
  let name = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (RESERVED_NAME.test(name)) name = `_${name}`;
  if (name.length > MAX_TRANSFER_NAME) {
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : '';
    const stem = name.slice(0, MAX_TRANSFER_NAME - extension.length).replace(/[. ]+$/, '');
    name = `${stem}${extension}`;
  }
  return name || fallback;
}

/** A chunk count for a byte count; an empty file still has one end frame. */
export function transferChunks(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 0;
  return Math.ceil(size / TRANSFER_CHUNK_BYTES);
}

/** 0-100, rounded down so a bar never claims a part it has not written. */
export function transferPercent(done: number, size: number): number {
  if (!Number.isFinite(size) || size <= 0) return done > 0 ? 100 : 0;
  const value = Math.floor((Math.max(0, done) / size) * 100);
  return Math.min(100, Math.max(0, value));
}

/** A byte count from the wire is only trusted as a plain non-negative integer. */
export function clampTransferSize(raw: unknown): number | null {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.floor(value))) return null;
  return Math.floor(value);
}

const SIZE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

export function formatTransferSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const unit = Math.min(SIZE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** unit;
  const digits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${SIZE_UNITS[unit]}`;
}

export function formatTransferRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s';
  return `${formatTransferSize(bytesPerSecond)}/s`;
}

/** A short "time left" label; empty when there is nothing honest to say. */
export function formatTransferEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 1) return '';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
  return `${rest}s`;
}

export function isFinishedTransfer(row: TransferRow): boolean {
  return (
    row.state === 'done' ||
    row.state === 'saved' ||
    row.state === 'declined' ||
    row.state === 'cancelled' ||
    row.state === 'failed'
  );
}

/**
 * Stable codes become English catalogue keys, so every failure is translated by
 * the same table the rest of the panel uses.
 */
const ERROR_TEXT: Record<string, string> = {
  'no-destination': 'No folder was chosen, so the transfer was cancelled.',
  'write-failed': 'The file could not be written.',
  'send-failed': 'The transfer failed.',
  'out-of-order': 'The file did not arrive intact. Try again.',
  'size-mismatch': 'The file did not arrive intact. Try again.',
  'peer-left': 'The other peer left the room.',
  cancelled: 'The other side cancelled the transfer.',
  busy: 'The other side is busy with another transfer.',
};

export function transferErrorText(code: string | undefined): string {
  return ERROR_TEXT[code ?? ''] ?? 'The transfer failed.';
}
