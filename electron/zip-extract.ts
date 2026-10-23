import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * A small ZIP reader for extension packages.
 *
 * `extract-zip` was the dependency here until two advisories landed with no
 * patched release: GHSA-jmr9-qjv8-65gv writes archive symlinks without
 * validating their targets, and GHSA-7pqw-9j4j-h8q3 chains a symlink entry and
 * a same-named file entry into an arbitrary write outside the destination.
 * Both need the archive to control paths on disk, so this reader never lets it:
 * symlinks, special files, absolute or parent paths, and names Windows would
 * fold together are all rejected before anything is written, and every file is
 * created with `wx` so nothing pre-existing can be written through.
 *
 * Only what Chrome packages actually use is supported: stored and deflated
 * entries, no encryption and no ZIP64. Anything else fails loudly rather than
 * being guessed at.
 */

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const END_RECORD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const MAX_ENTRIES = 20_000;
/** Headroom over the 80 MB package cap: deflate can expand a lot. */
const MAX_UNPACKED_BYTES = 256 * 1024 * 1024;
const MAX_NAME_BYTES = 1024;
const UNIX_FILE_TYPE = 0o170000;
const UNIX_SYMLINK = 0o120000;
const DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

interface CentralEntry {
  /** Archive path with forward slashes and no leading or trailing slash. */
  path: string;
  directory: boolean;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

export interface ExtractResult {
  files: number;
  bytes: number;
}

function fail(message: string): never {
  throw new ZipError(message);
}

/** The end record sits last, after an optional comment of up to 64 KiB. */
function findEndRecord(buffer: Buffer): number {
  if (buffer.length < END_RECORD_BYTES) return -1;
  const earliest = Math.max(0, buffer.length - END_RECORD_BYTES - MAX_COMMENT_BYTES);
  for (let offset = buffer.length - END_RECORD_BYTES; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== END_SIGNATURE) continue;
    const comment = buffer.readUInt16LE(offset + 20);
    if (offset + END_RECORD_BYTES + comment === buffer.length) return offset;
  }
  return -1;
}

/**
 * Rejects names a renderer could use to reach outside the destination: parent
 * segments, absolute and drive-qualified paths, backslashes (Windows would read
 * them as separators), control characters, and the trailing dot/space and
 * device names Windows silently rewrites into a different file.
 */
function safeName(rawName: string): { path: string; directory: boolean } {
  if (!rawName) fail('The package contains an entry with an empty name.');
  if (Buffer.byteLength(rawName, 'utf8') > MAX_NAME_BYTES) {
    fail('The package contains an entry name that is too long.');
  }
  for (const character of rawName) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || code === 92) {
      fail('The package contains an entry name with a character that is not allowed.');
    }
  }
  if (rawName.startsWith('/') || /^[a-zA-Z]:/.test(rawName)) {
    fail('The package contains an absolute path.');
  }
  const directory = rawName.endsWith('/');
  const trimmed = directory ? rawName.slice(0, -1) : rawName;
  if (trimmed === '') fail('The package contains an entry with an empty name.');
  const parts = trimmed.split('/');
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') {
      fail('The package contains a path outside its own folder.');
    }
    if (part.endsWith('.') || part.endsWith(' ')) {
      fail('The package contains a name Windows would rewrite.');
    }
    if (DEVICE_NAMES.test(part.split('.')[0] ?? part)) {
      fail('The package contains a reserved device name.');
    }
  }
  return { path: parts.join('/'), directory };
}

function readCentralDirectory(buffer: Buffer): CentralEntry[] {
  const end = findEndRecord(buffer);
  if (end < 0) fail('This file is not a readable ZIP package.');

  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  const offset = buffer.readUInt32LE(end + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    fail('ZIP64 packages are not supported.');
  }
  if (count === 0) fail('The package is empty.');
  if (count > MAX_ENTRIES) fail('The package contains too many files.');
  if (offset + size > buffer.length) fail('The package index sits outside the file.');

  const entries: CentralEntry[] = [];
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      fail('The package index is malformed.');
    }
    const madeBy = buffer.readUInt16LE(cursor + 4);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    if (nameStart + nameLength > buffer.length) fail('The package index is malformed.');

    const rawName = buffer.toString('utf8', nameStart, nameStart + nameLength);
    const { path: entryPath, directory } = safeName(rawName);

    // A symlink entry is the whole trick behind both advisories: the file is
    // written as a link to somewhere else, and a later entry writes through it.
    // Archives never need one here, so any link or special file ends the install.
    const unixMode = (madeBy >>> 8) === 3 ? externalAttributes >>> 16 : 0;
    if ((unixMode & UNIX_FILE_TYPE) === UNIX_SYMLINK) {
      fail('The package contains a symbolic link.');
    }
    const fileType = unixMode & UNIX_FILE_TYPE;
    if (fileType > 0 && fileType !== 0o100000 && fileType !== 0o040000) {
      fail('The package contains a file type that is not allowed.');
    }
    if (flags & 0x1) fail('Encrypted packages are not supported.');
    if (method !== 0 && method !== 8) fail('The package uses an unsupported compression method.');
    if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff) {
      fail('ZIP64 packages are not supported.');
    }

    entries.push({
      path: entryPath,
      directory: directory || (externalAttributes & 0x10) !== 0,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The compressed bytes of one entry, checked against the local header. */
function readEntryData(buffer: Buffer, entry: CentralEntry): Buffer {
  if (entry.localOffset + 30 > buffer.length) fail('An entry header sits outside the file.');
  if (buffer.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) fail('An entry header is malformed.');
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) fail('An entry runs past the end of the file.');
  const stored = buffer.subarray(start, end);

  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) fail('A stored entry has inconsistent sizes.');
    return stored;
  }
  let inflated: Buffer;
  try {
    // Capped at the size the index claims, so a bomb cannot outgrow its budget.
    inflated = zlib.inflateRawSync(stored, {
      maxOutputLength: Math.max(entry.uncompressedSize, 1),
    });
  } catch {
    fail('An entry could not be decompressed.');
  }
  if (inflated.length !== entry.uncompressedSize) {
    fail('An entry decompressed to an unexpected size.');
  }
  return inflated;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Unpacks `buffer` into `destination`, creating it (and every parent) as it
 * goes. Throws `ZipError` with a message fit for the install dialog.
 */
export function extractZip(buffer: Buffer, destination: string): ExtractResult {
  const entries = readCentralDirectory(buffer);
  const root = path.resolve(destination);
  fs.mkdirSync(root, { recursive: true });

  /** Lower-cased archive path -> the spelling the first entry used for it. */
  const folders = new Map<string, string>([['', '']]);
  const files = new Set<string>();
  let bytes = 0;
  let count = 0;

  /**
   * Creates every folder above `depth` and returns the relative path that was
   * actually used. Keys are case-folded so two entries differing only in case
   * share one folder, while the folder keeps the first spelling it was given.
   */
  const ensureFolder = (segments: string[], depth: number): string => {
    const key = segments.slice(0, depth).join('/').toLowerCase();
    const existing = folders.get(key);
    if (existing !== undefined) return existing;
    if (files.has(key)) fail('The package stores a file where a folder belongs.');
    const parent = ensureFolder(segments, depth - 1);
    const name = segments[depth - 1] as string;
    const relative = parent ? `${parent}/${name}` : name;
    const target = path.join(root, ...relative.split('/'));
    if (!isInside(root, target)) fail('The package contains a path outside its own folder.');
    try {
      fs.mkdirSync(target);
    } catch (error) {
      // Another entry may already have created it; anything that is not a real
      // directory (a link left by an earlier run, say) is refused.
      const stat = fs.lstatSync(target, { throwIfNoEntry: false });
      if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
        fail(
          error instanceof Error && 'code' in error && error.code === 'EEXIST'
            ? 'The package stores a folder where a file already is.'
            : 'The package could not be unpacked.',
        );
      }
    }
    folders.set(key, relative);
    return relative;
  };

  for (const entry of entries) {
    const segments = entry.path.split('/');
    const key = entry.path.toLowerCase();
    if (entry.directory) {
      ensureFolder(segments, segments.length);
      continue;
    }

    if (files.has(key)) fail('The package contains two entries with the same name.');
    if (folders.has(key)) fail('The package stores a file where a folder already is.');

    const name = segments[segments.length - 1] as string;
    const parent = ensureFolder(segments, segments.length - 1);
    const relative = parent ? `${parent}/${name}` : name;

    bytes += entry.uncompressedSize;
    if (bytes > MAX_UNPACKED_BYTES) fail('The package expands to more than 256 MB.');

    const target = path.join(root, ...relative.split('/'));
    if (!isInside(root, target)) fail('The package contains a path outside its own folder.');
    const data = readEntryData(buffer, entry);
    try {
      fs.writeFileSync(target, data, { flag: 'wx' });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        fail('The package would overwrite a file it already wrote.');
      }
      fail('The package could not be unpacked.');
    }
    files.add(key);
    count += 1;
  }

  if (count === 0) fail('The package contains no files.');
  return { files: count, bytes };
}
