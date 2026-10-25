import type { EmulatorSystem } from '../types';

/**
 * Save states, battery saves and the optional save folder.
 *
 * The emulator itself runs in a sandboxed frame with no storage: the sandbox is
 * what keeps the third-party core away from the Kryvex bridge, and it also
 * means EmulatorJS's own "save to browser" option writes into a shim that
 * discards everything. So the shell owns the bytes instead. States and battery
 * files live in IndexedDB here, named files can be mirrored into a folder the
 * user grants once, and a plain download is only ever used when the user asks
 * for an export.
 *
 * Nothing in this module reaches the network, and no ROM, save or thumbnail
 * ever leaves the machine.
 */

export type EmulatorSaveKind = 'quick' | 'manual';

export interface EmulatorStateRecord {
  id: string;
  /** Stable per cartridge: system plus the ROM's name hash. */
  gameKey: string;
  gameName: string;
  system: EmulatorSystem;
  kind: EmulatorSaveKind;
  label: string;
  createdAt: number;
  bytes: Uint8Array;
  /** Frame captured by the core beside the state, when it could take one. */
  thumb: Blob | null;
  size: number;
}

export interface EmulatorBatteryRecord {
  gameKey: string;
  gameName: string;
  updatedAt: number;
  bytes: Uint8Array;
}

/** Newest first. */
export function sortStates(states: EmulatorStateRecord[]): EmulatorStateRecord[] {
  return [...states].sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * How many states one cartridge may keep. The oldest save is dropped first, so
 * a long session cannot grow without bound, but the most recent twelve always
 * survive a restart.
 */
export const MAX_STATES_PER_GAME = 12;

export function pruneStates(
  states: EmulatorStateRecord[],
  limit = MAX_STATES_PER_GAME,
): { keep: EmulatorStateRecord[]; drop: EmulatorStateRecord[] } {
  const ordered = sortStates(states);
  return { keep: ordered.slice(0, limit), drop: ordered.slice(limit) };
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** `2026-10-24 18-42` in local time: sortable, and legal in a file name. */
export function saveStamp(createdAt: number): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'unknown-date';
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ` +
    `${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`
  );
}

/** Strips the characters Windows, macOS and Linux refuse in a file name. */
export function safeFileStem(name: string): string {
  // Only a file that has a stem keeps losing its extension: `.hidden` is a
  // name, not a suffix, and stripping it would leave nothing behind.
  const stemmed = name.replace(/^(.+?)\.[^.]+$/, '$1');
  const cleaned = stemmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  return (cleaned || 'game').slice(0, 80);
}

export function stateFileName(
  gameName: string,
  createdAt: number,
  kind: EmulatorSaveKind,
): string {
  return `${safeFileStem(gameName)} ${saveStamp(createdAt)} ${kind}.state`;
}

export function stateLabel(kind: EmulatorSaveKind, createdAt: number): string {
  return `${kind === 'quick' ? 'Quick save' : 'Save state'} · ${saveStamp(createdAt)}`;
}

export function formatSaveSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* --------------------------------------------------------------- storage --- */

const DB_NAME = 'kryvex-emulator';
const DB_VERSION = 1;
const STORE_STATES = 'states';
const STORE_BATTERIES = 'batteries';
const STORE_PREFS = 'prefs';

interface PrefRecord {
  key: string;
  value: unknown;
}

/**
 * IndexedDB is the real store. Node has none, so the same API keeps a small
 * in-memory set instead; that makes the rules (pruning, naming, ordering)
 * testable without a browser and keeps the view honest when storage is blocked.
 */
const memory = {
  states: new Map<string, EmulatorStateRecord>(),
  batteries: new Map<string, EmulatorBatteryRecord>(),
  prefs: new Map<string, unknown>(),
};

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_STATES)) {
        const store = db.createObjectStore(STORE_STATES, { keyPath: 'id' });
        store.createIndex('gameKey', 'gameKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BATTERIES)) {
        db.createObjectStore(STORE_BATTERIES, { keyPath: 'gameKey' });
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The save store could not be opened.'));
  });
}

async function withStore<T>(
  name: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(name, mode);
      const store = transaction.objectStore(name);
      let result: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error('The save store failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('The save store aborted.'));
      Promise.resolve(work(store)).then(
        value => {
          result = value;
        },
        error => {
          try {
            transaction.abort();
          } catch {
            // Already finished; the rejection below still reaches the caller.
          }
          reject(error);
        },
      );
    });
  } finally {
    db.close();
  }
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? new Error('The save store request failed.'));
  });
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `st-${crypto.randomUUID()}`;
  }
  return `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listStates(gameKey?: string): Promise<EmulatorStateRecord[]> {
  if (!hasIndexedDb()) {
    const all = [...memory.states.values()];
    return sortStates(gameKey ? all.filter(record => record.gameKey === gameKey) : all);
  }
  const rows = await withStore(STORE_STATES, 'readonly', store => request(store.getAll()));
  const all = (rows ?? []) as EmulatorStateRecord[];
  return sortStates(gameKey ? all.filter(record => record.gameKey === gameKey) : all);
}

export async function readState(id: string): Promise<EmulatorStateRecord | null> {
  if (!hasIndexedDb()) return memory.states.get(id) ?? null;
  const row = await withStore(STORE_STATES, 'readonly', store => request(store.get(id)));
  return (row as EmulatorStateRecord | undefined) ?? null;
}

export async function writeState(
  input: Omit<EmulatorStateRecord, 'id' | 'size'> & { id?: string },
): Promise<EmulatorStateRecord> {
  const record: EmulatorStateRecord = {
    ...input,
    id: input.id ?? newId(),
    size: input.bytes.byteLength,
  };
  if (!hasIndexedDb()) {
    memory.states.set(record.id, record);
  } else {
    await withStore(STORE_STATES, 'readwrite', store => request(store.put(record)));
  }
  // Cap the history for this cartridge, oldest first.
  const remaining = await listStates(record.gameKey);
  const { drop } = pruneStates(remaining);
  for (const stale of drop) await deleteState(stale.id);
  return record;
}

export async function deleteState(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    memory.states.delete(id);
    return;
  }
  await withStore(STORE_STATES, 'readwrite', store => request(store.delete(id)));
}

export async function clearGameStates(gameKey: string): Promise<number> {
  const records = await listStates(gameKey);
  for (const record of records) await deleteState(record.id);
  return records.length;
}

export async function writeBattery(
  record: Omit<EmulatorBatteryRecord, 'updatedAt'>,
): Promise<EmulatorBatteryRecord> {
  const next: EmulatorBatteryRecord = { ...record, updatedAt: Date.now() };
  if (!hasIndexedDb()) {
    memory.batteries.set(next.gameKey, next);
    return next;
  }
  await withStore(STORE_BATTERIES, 'readwrite', store => request(store.put(next)));
  return next;
}

export async function readBattery(gameKey: string): Promise<Uint8Array | null> {
  if (!hasIndexedDb()) return memory.batteries.get(gameKey)?.bytes ?? null;
  const row = (await withStore(STORE_BATTERIES, 'readonly', store =>
    request(store.get(gameKey)),
  )) as EmulatorBatteryRecord | undefined;
  return row?.bytes ?? null;
}

/* ---------------------------------------------------------- save folder --- */

/**
 * The smallest shape of the File System Access API this app uses. The types are
 * declared here rather than imported so the panel still type-checks on a
 * TypeScript version whose DOM library predates the pickers.
 */
export interface SaveWritable {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
}

export interface SaveFileHandle {
  name: string;
  createWritable(): Promise<SaveWritable>;
}

export interface SaveDirectoryHandle {
  name: string;
  kind: 'directory';
  getFileHandle(name: string, options?: { create?: boolean }): Promise<SaveFileHandle>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

export type DirectoryPick =
  | { ok: true; handle: SaveDirectoryHandle }
  | { ok: false; reason: 'unsupported' | 'cancelled' };

type Picker = (options?: { id?: string; mode?: 'readwrite' }) => Promise<SaveDirectoryHandle>;

function directoryPicker(): Picker | null {
  if (typeof window === 'undefined') return null;
  const picker = (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  return typeof picker === 'function' ? picker : null;
}

export function canPickSaveFolder(): boolean {
  return directoryPicker() !== null;
}

/** Opens the folder picker once; the handle is stored so later saves reuse it. */
export async function pickSaveDirectory(): Promise<DirectoryPick> {
  const picker = directoryPicker();
  if (!picker) return { ok: false, reason: 'unsupported' };
  try {
    const handle = await picker({ id: 'kryvex-emulator-saves', mode: 'readwrite' });
    const permission = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (permission !== 'granted') return { ok: false, reason: 'cancelled' };
    await setSaveDirectory(handle);
    return { ok: true, handle };
  } catch {
    return { ok: false, reason: 'cancelled' };
  }
}

/**
 * Handles survive a restart in IndexedDB, but the permission grant does not:
 * the browser asks once per session, and a revoked folder is reported as null
 * rather than throwing into the middle of a save.
 */
export async function getSaveDirectory(): Promise<SaveDirectoryHandle | null> {
  const stored = await readPref<SaveDirectoryHandle>('saveDirectory');
  if (!stored) return null;
  const state = (await stored.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  return state === 'granted' ? stored : null;
}

export async function setSaveDirectory(handle: SaveDirectoryHandle | null): Promise<void> {
  await writePref('saveDirectory', handle);
}

export async function writeStateToDirectory(
  directory: SaveDirectoryHandle,
  record: EmulatorStateRecord,
): Promise<string> {
  const name = stateFileName(record.gameName, record.createdAt, record.kind);
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(new Blob([record.bytes as unknown as BlobPart]));
  await writable.close();
  if (record.thumb) {
    try {
      const image = await directory.getFileHandle(name.replace(/\.state$/, '.webp'), {
        create: true,
      });
      const imageWritable = await image.createWritable();
      await imageWritable.write(record.thumb);
      await imageWritable.close();
    } catch {
      // The state is the part that matters; a missing thumbnail is not an error.
    }
  }
  return name;
}

async function readPref<T>(key: string): Promise<T | null> {
  if (!hasIndexedDb()) return (memory.prefs.get(key) as T | undefined) ?? null;
  const row = (await withStore(STORE_PREFS, 'readonly', store =>
    request(store.get(key)),
  )) as PrefRecord | undefined;
  return (row?.value as T | undefined) ?? null;
}

async function writePref(key: string, value: unknown): Promise<void> {
  if (!hasIndexedDb()) {
    memory.prefs.set(key, value);
    return;
  }
  await withStore(STORE_PREFS, 'readwrite', store => request(store.put({ key, value })));
}

/* ---------------------------------------------------------------- export --- */

/** A download only happens when the user asks for a file. */
export function downloadState(record: EmulatorStateRecord): string {
  const name = stateFileName(record.gameName, record.createdAt, record.kind);
  const url = URL.createObjectURL(new Blob([record.bytes as unknown as BlobPart]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

/** For tests: forget everything the memory fallback kept. */
export function resetEmulatorSavesForTests(): void {
  memory.states.clear();
  memory.batteries.clear();
  memory.prefs.clear();
}
