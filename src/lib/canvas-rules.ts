/**
 * Canvas: the document model and its rules.
 *
 * The sheet is a list of vector items rather than pixels, which is what makes
 * undo, redo and a resize of the sheet itself possible after the fact: the
 * canvas is redrawn from the list, never read back from its own pixels.
 *
 * A saved document is JSON with a marker field, so `isCanvasDocument` can refuse
 * anything else before it reaches the renderer's item loop.
 */

export type CanvasTool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'text';

export const CANVAS_TOOLS: readonly CanvasTool[] = ['brush', 'eraser', 'line', 'rect', 'ellipse', 'text'];

export type CanvasExport = 'png' | 'jpeg' | 'webp' | 'bmp';

export const CANVAS_EXPORTS: readonly CanvasExport[] = ['png', 'jpeg', 'webp', 'bmp'];

export const CANVAS_COLOURS: readonly string[] = [
  '#f8fafc',
  '#0b1120',
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#94a3b8',
];

export const CANVAS_BACKGROUNDS: readonly string[] = ['#0b1120', '#111827', '#1f2937', '#f8fafc', '#ffffff'];

export const CANVAS_WIDTHS: readonly number[] = [2, 4, 8, 16];

export const CANVAS_PRESETS: readonly { id: string; label: string; width: number; height: number }[] = [
  { id: 'wide', label: '1280 × 800', width: 1280, height: 800 },
  { id: 'hd', label: '1920 × 1080', width: 1920, height: 1080 },
  { id: 'square', label: '1000 × 1000', width: 1000, height: 1000 },
  { id: 'portrait', label: '800 × 1200', width: 800, height: 1200 },
];

export type CanvasItem =
  | {
      kind: 'stroke';
      tool: 'brush' | 'eraser';
      colour: string;
      width: number;
      points: [number, number][];
    }
  | {
      kind: 'shape';
      tool: 'line' | 'rect' | 'ellipse';
      colour: string;
      width: number;
      from: [number, number];
      to: [number, number];
    }
  | { kind: 'text'; colour: string; size: number; at: [number, number]; text: string };

export interface CanvasDocument {
  /** Refuses any JSON that is not a Kryvex sheet. */
  kryvexCanvas: number;
  width: number;
  height: number;
  background: string;
  items: CanvasItem[];
}

export const CANVAS_FORMAT = 1;

export function emptyDocument(width = 1280, height = 800, background = '#0b1120'): CanvasDocument {
  return { kryvexCanvas: CANVAS_FORMAT, width, height, background, items: [] };
}

function pair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [x, y] = value;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

function colourOf(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : null;
}

/** A loaded item, or null when it is not one this build can draw. */
export function readItem(raw: unknown): CanvasItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const colour = colourOf(item.colour);
  if (!colour) return null;
  // Only a drawn item carries a stroke width; typed text has a size instead.
  const width = typeof item.width === 'number' && item.width > 0 && item.width <= 64 ? item.width : null;
  if (item.kind === 'stroke') {
    if (width === null) return null;
    if (item.tool !== 'brush' && item.tool !== 'eraser') return null;
    if (!Array.isArray(item.points) || item.points.length === 0 || item.points.length > 40_000) return null;
    const points: [number, number][] = [];
    for (const point of item.points) {
      const parsed = pair(point);
      if (!parsed) return null;
      points.push(parsed);
    }
    return { kind: 'stroke', tool: item.tool, colour, width, points };
  }
  if (item.kind === 'shape') {
    if (width === null) return null;
    if (item.tool !== 'line' && item.tool !== 'rect' && item.tool !== 'ellipse') return null;
    const from = pair(item.from);
    const to = pair(item.to);
    if (!from || !to) return null;
    return { kind: 'shape', tool: item.tool, colour, width, from, to };
  }
  if (item.kind === 'text') {
    const at = pair(item.at);
    const size = typeof item.size === 'number' && item.size >= 8 && item.size <= 200 ? item.size : null;
    if (!at || size === null) return null;
    if (typeof item.text !== 'string' || item.text.length === 0 || item.text.length > 4000) return null;
    return { kind: 'text', colour, size, at, text: item.text };
  }
  return null;
}

/** Validates a saved sheet: unknown items are dropped, a broken one is refused. */
export function isCanvasDocument(value: unknown): value is CanvasDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  if (doc.kryvexCanvas !== CANVAS_FORMAT) return false;
  if (typeof doc.width !== 'number' || typeof doc.height !== 'number') return false;
  if (!Array.isArray(doc.items)) return false;
  if (doc.items.length > 20_000) return false;
  return colourOf(doc.background) !== null;
}

export function readDocument(value: unknown): CanvasDocument | null {
  if (!isCanvasDocument(value)) return null;
  const doc = value as CanvasDocument;
  const items = doc.items.map(readItem).filter((item): item is CanvasItem => item !== null);
  const width = Math.min(4000, Math.max(320, Math.round(doc.width)));
  const height = Math.min(4000, Math.max(240, Math.round(doc.height)));
  return { kryvexCanvas: CANVAS_FORMAT, width, height, background: doc.background, items };
}

/**
 * A stroke as a smooth path: the midpoint of each pair of samples becomes the
 * curve's anchor. It is the cheapest way to make a pointer trail look drawn
 * rather than assembled out of straight segments, and it is pure, so it can be
 * tested without a canvas.
 */
export function strokePath(points: [number, number][]): { x: number; y: number }[] | null {
  if (points.length < 2) return null;
  const path: { x: number; y: number }[] = [];
  const first = points[0]!;
  path.push({ x: first[0], y: first[1] });
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    path.push({ x: (current[0] + next[0]) / 2, y: (current[1] + next[1]) / 2 });
  }
  const last = points[points.length - 1]!;
  path.push({ x: last[0], y: last[1] });
  return path;
}

/** The plain text of a sheet: its typed items, in the order they were placed. */
export function textOf(items: CanvasItem[]): string {
  return items
    .filter((item): item is Extract<CanvasItem, { kind: 'text' }> => item.kind === 'text')
    .map(item => item.text)
    .join('\n');
}

function rtfEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/[^\x20-\x7e\n]/g, character =>
      character === '\n' ? '\n' : `\\u${character.charCodeAt(0)}?`,
    );
}

/**
 * Rich Text for the typed items.
 *
 * Word cannot open a `.doc` that was not written by Word — it is a binary
 * container, not a text format — so the honest shareable document is RTF, which
 * Word, LibreOffice and WordPad all open natively.
 */
export function rtfOf(items: CanvasItem[]): string {
  const blocks = items
    .filter((item): item is Extract<CanvasItem, { kind: 'text' }> => item.kind === 'text')
    .map(item => rtfEscape(item.text).replace(/\n/g, '\\par\n'));
  const body = blocks.length > 0 ? blocks.join('\\par\n') : '';
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\viewkind4\\uc1\\f0\\fs24 ${body}}\n`;
}

export function documentNameOf(name: string | undefined, extension: string): string {
  const stem = (name ?? 'kryvex-canvas').replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/[^\w ()-]+/g, '-');
  return `${stem || 'kryvex-canvas'}.${extension}`;
}
