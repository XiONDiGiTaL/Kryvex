/**
 * File Forge's rules.
 *
 * The workbench has four groups — images, PDFs, data and rename — and all four
 * need the same thing: a decision made the same way every time, with no DOM and
 * no dialogs involved. What can be converted into what, how a size is fitted,
 * how a CSV is quoted and how a rename pattern reads are all here, so the view
 * only draws the answers and the tests can check them.
 *
 * The workbench never claims a capability it does not have. `IMAGE_OUTPUTS` is
 * the matrix the interface offers destinations from, and there is no entry for
 * audio or video because this build has no codec for either.
 */

export type ForgeGroup = 'images' | 'pdf' | 'data' | 'rename';

export const FORGE_GROUPS: readonly ForgeGroup[] = ['images', 'pdf', 'data', 'rename'];

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'bmp';

/** The destinations the interface may offer, in the order it offers them. */
export const IMAGE_OUTPUTS: readonly ImageFormat[] = ['png', 'jpeg', 'webp', 'bmp'];

/** Formats the picker accepts. A GIF is read as its first frame. */
export const IMAGE_INPUTS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];

export const IMAGE_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

export function extensionOf(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function isImageFormat(value: unknown): value is ImageFormat {
  return typeof value === 'string' && (IMAGE_OUTPUTS as readonly string[]).includes(value);
}

/** The longest edge the image may keep, or `null` for the size it arrived at. */
export type MaxEdge = number | null;

export const MAX_EDGE_CHOICES: readonly { id: string; edge: MaxEdge }[] = [
  { id: 'original', edge: null },
  { id: '2560', edge: 2560 },
  { id: '1920', edge: 1920 },
  { id: '1280', edge: 1280 },
  { id: '640', edge: 640 },
];

/**
 * A pixel size fitted into a maximum edge, keeping the aspect ratio.
 *
 * Rounding is done on both axes and a side is never allowed to fall to zero: a
 * 4000×3 image reduced to a 640 edge keeps a height of 1 rather than becoming
 * an empty canvas.
 */
export function fitSize(
  width: number,
  height: number,
  maxEdge: MaxEdge,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const h = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  if (!maxEdge || maxEdge <= 0) return { width: w, height: h };
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** The name an image gets on the way out: `photo.png` → `photo.webp`. */
export function imageOutputName(input: string, format: ImageFormat, suffix = ''): string {
  const stem = input.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'image';
  return `${stem}${suffix}.${extensionOf(format)}`;
}

/**
 * A 24-bit BMP of an RGBA buffer.
 *
 * Chromium's canvas encodes PNG, JPEG and WebP and nothing else, and BMP is one
 * of the formats this app promises, so it is written by hand. Rows are padded to
 * a four-byte boundary and stored bottom-up, which is what the format requires;
 * the alpha channel has no room in a 24-bit file, so it composites over white.
 */
export function encodeBmp(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const pixelBytes = rowSize * h;
  const out = new Uint8Array(54 + pixelBytes);
  const view = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  view.setUint32(2, 54 + pixelBytes, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  view.setUint32(38, 2835, true);
  view.setUint32(42, 2835, true);

  for (let y = 0; y < h; y += 1) {
    // Bottom-up: the first stored row is the last image row.
    const source = (h - 1 - y) * w * 4;
    const target = 54 + y * rowSize;
    for (let x = 0; x < w; x += 1) {
      const i = source + x * 4;
      const r = rgba[i] ?? 0;
      const g = rgba[i + 1] ?? 0;
      const b = rgba[i + 2] ?? 0;
      const a = (rgba[i + 3] ?? 255) / 255;
      const at = target + x * 3;
      // BMP stores a row as BGR, unlike almost every other image format.
      out[at] = Math.round(b * a + 255 * (1 - a));
      out[at + 1] = Math.round(g * a + 255 * (1 - a));
      out[at + 2] = Math.round(r * a + 255 * (1 - a));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ data --- */

export const MAX_TEXT_BYTES = 12 * 1024 * 1024;
export const MAX_ROWS = 200_000;

export interface TextResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'object' ? JSON.stringify(value) : typeof value === 'string' ? value : String(value);
  return /[",\n\r]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows of objects to CSV, with one column per key in the order they appear. */
export function jsonToCsv(text: string, delimiter: ',' | ';' | '\t' = ','): TextResult<string> {
  if (text.length > MAX_TEXT_BYTES) return { ok: false, error: 'too-large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
      ? ((parsed as { rows: unknown[] }).rows)
      : null;
  if (!rows) return { ok: false, error: 'not-a-list' };
  if (rows.length === 0) return { ok: false, error: 'empty' };
  if (rows.length > MAX_ROWS) return { ok: false, error: 'too-many-rows' };

  const columns: string[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') {
      if (!columns.includes('value')) columns.push('value');
      continue;
    }
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }
  if (columns.length === 0) return { ok: false, error: 'empty' };
  const lines = [columns.map(csvField).join(delimiter)];
  for (const row of rows) {
    const source: Record<string, unknown> =
      row !== null && typeof row === 'object' ? (row as Record<string, unknown>) : { value: row };
    lines.push(columns.map(column => csvField(source[column])).join(delimiter));
  }
  return { ok: true, value: `${lines.join('\r\n')}\r\n` };
}

/** Splits one CSV line into fields, honouring quotes and doubled quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      fields.push(field);
      field = '';
      continue;
    }
    field += char;
  }
  fields.push(field);
  return fields;
}

/** The delimiter a file is most likely written with, from its own header row. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const header = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const counts: Array<[',' | ';' | '\t', number]> = [
    [',', (header.match(/,/g) ?? []).length],
    [';', (header.match(/;/g) ?? []).length],
    ['\t', (header.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

/** Numbers and booleans are read back as such; everything else stays text. */
function coerce(value: string): unknown {
  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value) && value.length < 16) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return value;
}

export function csvToJson(text: string, pretty = true): TextResult<string> {
  if (text.length > MAX_TEXT_BYTES) return { ok: false, error: 'too-large' };
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };
  const lines = trimmed.split(/\r\n|\n|\r/).filter(line => line.length > 0);
  if (lines.length === 0) return { ok: false, error: 'empty' };
  if (lines.length - 1 > MAX_ROWS) return { ok: false, error: 'too-many-rows' };
  const delimiter = detectDelimiter(trimmed);

  const header = splitLine(lines[0]!, delimiter).map((name, index) => {
    const clean = name.trim();
    return clean === '' ? `column${index + 1}` : clean;
  });
  const rows: Record<string, unknown>[] = [];
  for (const line of lines.slice(1)) {
    const fields = splitLine(line, delimiter);
    const row: Record<string, unknown> = {};
    header.forEach((column, index) => {
      row[column] = coerce(fields[index] ?? '');
    });
    // More fields than headers: keep them rather than silently dropping data.
    for (let index = header.length; index < fields.length; index += 1) {
      row[`column${index + 1}`] = coerce(fields[index] ?? '');
    }
    rows.push(row);
  }
  return { ok: true, value: JSON.stringify(rows, null, pretty ? 2 : 0) };
}

/* ------------------------------------------------------------------- pdf --- */

/**
 * A reorder string such as `3,1,2` turned into zero-based page indices.
 *
 * Only a full permutation is accepted: a list that repeats a page or omits one
 * would silently drop content, which is not a reorder. `null` means the string
 * could not be read that way, and the view says so instead of guessing.
 */
export function parsePageOrder(input: string, total: number): number[] | null {
  const parts = input
    .split(/[\s,]+/)
    .map(part => part.trim())
    .filter(part => part.length > 0);
  if (parts.length !== total) return null;
  const order: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const page = Number(part);
    if (page < 1 || page > total || order.includes(page - 1)) return null;
    order.push(page - 1);
  }
  return order;
}

/** `1-3,5` → the page ranges a split will produce, zero-based and inclusive. */
export function parsePageRanges(input: string, total: number): number[][] | null {
  const parts = input
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);
  if (parts.length === 0) return null;
  const ranges: number[][] = [];
  for (const part of parts) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) return null;
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to < from || to > total) return null;
    const range: number[] = [];
    for (let page = from; page <= to; page += 1) range.push(page - 1);
    ranges.push(range);
  }
  return ranges;
}

/* ---------------------------------------------------------------- rename --- */

export interface RenameStep {
  from: string;
  to: string;
  /** Present when this row cannot be applied as it stands. */
  error?: string;
}

/**
 * Applies a rename pattern to one name.
 *
 * Tokens: `{name}` is the original stem, `{n}` the position in the batch (padded
 * to the width the batch needs), `{ext}` the original extension without its dot,
 * `{date}` today's date, `{count}` how many files are in the batch. Anything else
 * between braces is left as typed, so a user who writes `{foo}` sees it rather
 * than losing it.
 */
export function applyRenamePattern(
  pattern: string,
  original: string,
  index: number,
  count: number,
  now = new Date(),
): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(original);
  const ext = match ? match[1]! : '';
  const stem = match ? original.slice(0, original.length - ext.length - 1) : original;
  const digits = String(count).length;
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const replaced = pattern
    .replace(/\{name\}/gi, stem)
    .replace(/\{n\}/gi, String(index + 1).padStart(digits, '0'))
    .replace(/\{ext\}/gi, ext)
    .replace(/\{date\}/gi, date)
    .replace(/\{count\}/gi, String(count));
  // Characters a filesystem refuses are replaced here rather than by the main
  // process, so the preview and the result are the same string.
  const cleaned = replaced.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^[.\s]+/, '').trim();
  const body = cleaned.slice(0, 100) || stem;
  if (!ext) return body;
  return /\.\w{1,8}$/.test(body) && body.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
    ? body
    : `${body}.${ext}`;
}

export function renamePlan(
  files: { name: string; path: string }[],
  pattern: string,
  startAt = 1,
): RenameStep[] {
  const steps: RenameStep[] = [];
  const seen = new Set<string>();
  files.forEach((file, index) => {
    const to = applyRenamePattern(pattern, file.name, index + startAt - 1, files.length);
    const key = to.toLowerCase();
    const error = seen.has(key)
      ? 'duplicate'
      : to === file.name
        ? 'unchanged'
        : !/\.[A-Za-z0-9]{1,8}$/.test(to)
          ? 'no-extension'
          : undefined;
    if (!error) seen.add(key);
    steps.push({ from: file.name, to, error });
  });
  return steps;
}

/* ----------------------------------------------------------------- labels --- */

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(size) : Math.round(size * 10) / 10} ${units[unit]}`;
}

/** Size in points for an image placed on a PDF page, at a chosen DPI. */
export function pageSizeFor(width: number, height: number, dpi: number): { width: number; height: number } {
  const scale = 72 / (dpi > 0 ? dpi : 96);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
