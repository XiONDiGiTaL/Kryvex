/**
 * Rules for the file boundary the in-house tools use.
 *
 * Kryvex had one general writer before this: `captureTools.save`, which takes
 * base64 and forces a `.png` or `.webm`. File Forge and Canvas need more than
 * that — pick a document, write a converted copy, rename a batch — so the rules
 * that keep that safe live here, apart from Electron, and are unit-tested
 * without a window or a dialog.
 *
 * The three properties this file exists to guarantee:
 *
 * - The renderer proposes a name; this decides what may actually be written.
 *   Only extensions on `WRITABLE_EXTENSIONS` survive, so a converted image can
 *   never propose `setup.exe`.
 * - Bytes are checked against their own magic numbers, so a "PNG" that is not a
 *   PNG is refused rather than written under a name that lies about it.
 * - Renaming is limited to files this process already handed out in a pick, so
 *   the renderer cannot nominate an arbitrary path on the disk.
 */
export type FileKind = 'image' | 'pdf' | 'data';

export interface PickedFile {
  name: string;
  path: string;
  size: number;
  kind: FileKind;
  /** base64 of the bytes, so the renderer can transform them locally. */
  data: string;
}

/**
 * What went wrong, as a code rather than a sentence.
 *
 * The main process does not know the interface language, so it never writes a
 * sentence a user will read: it names the failure and the view translates it.
 * `detail` carries the file name when the message needs one.
 */
export type FileKitCode =
  | 'too-big'
  | 'too-many-bytes'
  | 'read-failed'
  | 'no-readable-file'
  | 'no-extension'
  | 'empty-or-large'
  | 'format-mismatch'
  | 'nothing-to-export'
  | 'write-failed'
  | 'not-picked'
  | 'bad-name'
  | 'duplicate-name'
  | 'target-exists';

export interface FilePickResult {
  ok: boolean;
  files: PickedFile[];
  cancelled?: boolean;
  code?: FileKitCode;
  detail?: string;
}

export interface WrittenFile {
  name: string;
  path: string;
  size: number;
}

export interface FileSaveResult {
  ok: boolean;
  saved: WrittenFile[];
  cancelled?: boolean;
  code?: FileKitCode;
  detail?: string;
}

export interface FileRenameResult {
  ok: boolean;
  renamed: { from: string; to: string }[];
  code?: FileKitCode;
  detail?: string;
}

/** Extensions a pick offers, by kind. `gif` is read-only: nothing writes one. */
export const PICKABLE_EXTENSIONS: Record<FileKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'],
  pdf: ['pdf'],
  data: ['json', 'csv', 'tsv', 'txt', 'md', 'rtf', 'xml', 'kxcanvas'],
};

/** Every extension a request may name as an output. */
export const WRITABLE_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'bmp',
  'pdf',
  'csv',
  'tsv',
  'json',
  'txt',
  'rtf',
  'md',
  'kxcanvas',
];

/** Kind implied by an output extension, for sniffing a written payload. */
export function kindOfExtension(name: unknown): FileKind | null {
  const ext = extOf(typeof name === 'string' ? name : '');
  if (!ext) return null;
  for (const kind of ['image', 'pdf', 'data'] as const) {
    if (PICKABLE_EXTENSIONS[kind].includes(ext)) return kind;
  }
  if (ext === 'tsv' || ext === 'kxcanvas') return 'data';
  return null;
}

export function extOf(name: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return match ? match[1]!.toLowerCase() : '';
}

/** A per-file ceiling on both ends: 48 MB in, 96 MB out. */
export const MAX_FILE_BYTES = 48 * 1024 * 1024;
export const MAX_WRITE_BYTES = 96 * 1024 * 1024;
/** One pick may not pull in more than this in total. */
export const MAX_PICK_BYTES = 96 * 1024 * 1024;
export const MAX_PICK_FILES = 40;

const BASE64 = /^[A-Za-z0-9+/\r\n]+={0,2}$/;

/**
 * A proposed output name, reduced to one the filesystem and the user can both
 * live with: no directory, no traversal, no control characters, and an
 * extension from the allowlist rather than whatever was proposed.
 */
export function safeFileName(raw: unknown, fallback = 'kryvex-export'): string | null {
  if (typeof raw !== 'string') return null;
  const wanted = raw.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
  if (!wanted) return null;
  const ext = extOf(wanted);
  if (!ext || !WRITABLE_EXTENSIONS.includes(ext)) return null;
  const stem = (wanted.slice(0, wanted.length - ext.length - 1) || fallback)
    .replace(/[^A-Za-z0-9._ ()-]+/g, '-')
    .replace(/^[.\s]+/, '')
    .slice(0, 90);
  return `${stem || fallback}.${ext}`;
}

/** True when the value is a file name and nothing but a file name. */
export function isPlainFileName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 120) return false;
  if (value.includes('/') || value.includes('\\')) return false;
  if (/[\u0000-\u001f<>:"|?*]/.test(value)) return false;
  if (value === '.' || value === '..') return false;
  if (!/\./.test(value)) return false;
  return true;
}

export function decodeBase64(raw: unknown, limit: number): Buffer | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // base64 is 4 characters per 3 bytes; reject on the string length first so a
  // huge payload is never copied only to be thrown away.
  if (raw.length > Math.ceil(limit / 3) * 4 + 4) return null;
  if (!BASE64.test(raw)) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > limit) return null;
  return bytes;
}

function startsWith(bytes: Buffer, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * The kind a payload actually is, from its own header.
 *
 * A `pdf` output is written through pdf-lib, so the marker is on page one; text
 * and JSON are recognised by the absence of a binary header rather than by a
 * guess, which is why a payload with NUL bytes in it is refused outright.
 */
export function sniffKind(bytes: Buffer): FileKind | 'kxcanvas' | null {
  if (bytes.length < 4) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image';
  if (startsWith(bytes, [0x42, 0x4d])) return 'image';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image';
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  const head = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (head.includes(0)) return null;
  const text = head.toString('utf8');
  if (/^\s*\{[\s\S]*"kryvexCanvas"\s*:/.test(text)) return 'kxcanvas';
  return 'data';
}

/** A name that does not collide with one already used in this write. */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) {
    taken.add(name.toLowerCase());
    return name;
  }
  const ext = extOf(name);
  const stem = ext ? name.slice(0, name.length - ext.length - 1) : name;
  for (let index = 2; index < 500; index += 1) {
    const candidate = ext ? `${stem} (${index}).${ext}` : `${stem} (${index})`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
  return `${stem}-${Date.now()}.${ext || 'txt'}`;
}

/** A label for the dialog, per kind. */
export function filtersFor(kind: FileKind): Electron.FileFilter[] {
  const labels: Record<FileKind, string> = {
    image: 'Images',
    pdf: 'PDF documents',
    data: 'Text and data',
  };
  return [
    { name: labels[kind], extensions: PICKABLE_EXTENSIONS[kind] },
    { name: 'All files', extensions: ['*'] },
  ];
}

/** The kind a picked file is treated as, from its extension. */
export function pickKind(name: string): FileKind | null {
  return kindOfExtension(name);
}
