import { describe, expect, it } from 'vitest';
import {
  CANVAS_BACKGROUNDS,
  CANVAS_EXPORTS,
  CANVAS_FORMAT,
  CANVAS_TOOLS,
  emptyDocument,
  documentNameOf,
  isCanvasDocument,
  readDocument,
  readItem,
  rtfOf,
  strokePath,
  textOf,
  type CanvasItem,
} from '../src/lib/canvas-rules';

const stroke: CanvasItem = {
  kind: 'stroke',
  tool: 'brush',
  colour: '#38bdf8',
  width: 4,
  points: [
    [10, 10],
    [20, 20],
    [30, 10],
  ],
};

const label: CanvasItem = {
  kind: 'text',
  colour: '#f8fafc',
  size: 28,
  at: [40, 60],
  text: 'Remember the milk',
};

describe('the sheet', () => {
  it('starts empty at a usable size', () => {
    const doc = emptyDocument();
    expect(doc.kryvexCanvas).toBe(CANVAS_FORMAT);
    expect(doc.items).toEqual([]);
    expect(doc.width).toBeGreaterThan(0);
    expect(CANVAS_BACKGROUNDS).toContain(doc.background);
  });

  it('offers the tools and the export formats the view draws', () => {
    expect([...CANVAS_TOOLS]).toContain('eraser');
    expect([...CANVAS_TOOLS]).toContain('text');
    expect([...CANVAS_EXPORTS]).toEqual(['png', 'jpeg', 'webp', 'bmp']);
  });

  it('refuses anything that is not one of its own files', () => {
    expect(isCanvasDocument({ hello: 'world' })).toBe(false);
    expect(isCanvasDocument({ kryvexCanvas: CANVAS_FORMAT, width: 10, height: 10, items: [] })).toBe(
      false,
    );
    expect(isCanvasDocument(emptyDocument())).toBe(true);
    expect(readDocument({ ...emptyDocument(), kryvexCanvas: 99 })).toBeNull();
  });

  it('drops items it cannot draw and clamps a size that came from a file', () => {
    const doc = readDocument({
      kryvexCanvas: CANVAS_FORMAT,
      width: 99_999,
      height: 10,
      background: '#0b1120',
      items: [stroke, { kind: 'stroke', tool: 'brush', colour: 'nope', width: 1, points: [[1, 1]] }, label],
    });
    expect(doc).not.toBeNull();
    expect(doc!.items).toHaveLength(2);
    expect(doc!.width).toBe(4000);
    expect(doc!.height).toBe(240);
  });

  it('validates one item at a time, including a shape', () => {
    expect(readItem(stroke)).toEqual(stroke);
    expect(readItem({ ...stroke, points: [] })).toBeNull();
    expect(readItem({ ...stroke, colour: 'red' })).toBeNull();
    expect(
      readItem({
        kind: 'shape',
        tool: 'rect',
        colour: '#34d399',
        width: 2,
        from: [1, 2],
        to: [3, 4],
      }),
    ).toEqual({
      kind: 'shape',
      tool: 'rect',
      colour: '#34d399',
      width: 2,
      from: [1, 2],
      to: [3, 4],
    });
    expect(readItem({ kind: 'shape', tool: 'star', colour: '#34d399', width: 2, from: [1, 2], to: [3, 4] })).toBeNull();
    expect(readItem({ kind: 'text', colour: '#fff', size: 4, at: [0, 0], text: 'hi' })).toBeNull();
  });
});

describe('strokes', () => {
  it('smoothes a trail through the midpoints', () => {
    expect(strokePath([[0, 0], [10, 10], [20, 0]])).toEqual([
      { x: 0, y: 0 },
      { x: 15, y: 5 },
      { x: 20, y: 0 },
    ]);
  });

  it('has no path for a single sample, which is drawn as a dot instead', () => {
    expect(strokePath([[5, 5]])).toBeNull();
    expect(strokePath([])).toBeNull();
  });
});

describe('the words', () => {
  it('collects typed items in the order they were placed', () => {
    expect(textOf([stroke, label, { ...label, text: 'and bread' }])).toBe(
      'Remember the milk\nand bread',
    );
    expect(textOf([stroke])).toBe('');
  });

  it('writes Rich Text, because a .doc is not a text format', () => {
    const rtf = rtfOf([label]);
    expect(rtf.startsWith('{\\rtf1')).toBe(true);
    expect(rtf).toContain('Remember the milk');
    expect(rtf.trimEnd().endsWith('}')).toBe(true);
    expect(rtfOf([stroke])).toContain('\\rtf1');
  });

  it('escapes the characters Rich Text treats as syntax', () => {
    const rtf = rtfOf([{ ...label, text: 'a\\b{c}' }]);
    expect(rtf).toContain('a\\\\b\\{c\\}');
  });

  it('names a saved file from the sheet, whatever the sheet was called', () => {
    expect(documentNameOf('kryvex-canvas', 'png')).toBe('kryvex-canvas.png');
    expect(documentNameOf('my sketch.kxcanvas', 'png')).toBe('my sketch.png');
    expect(documentNameOf(undefined, 'rtf')).toBe('kryvex-canvas.rtf');
    expect(documentNameOf('a/b:c', 'png')).toBe('a-b-c.png');
  });
});
