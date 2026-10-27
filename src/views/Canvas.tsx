import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import { base64ToBytes, bytesToBase64 } from '../lib/binary';
import { useT } from '../lib/i18n';
import {
  CANVAS_BACKGROUNDS,
  CANVAS_COLOURS,
  CANVAS_EXPORTS,
  CANVAS_PRESETS,
  CANVAS_TOOLS,
  CANVAS_WIDTHS,
  documentNameOf,
  rtfOf,
  strokePath,
  textOf,
  type CanvasItem,
} from '../lib/canvas-rules';
import { useCanvas, replaceDoc, resetDoc, redo, undo, updateDoc, updatePrefs } from '../lib/canvas-session';
import { IMAGE_MIME, encodeBmp } from '../lib/forge-rules';

/**
 * Canvas: a sheet to draw and type on, inside Kryvex.
 *
 * The sheet is a list of marks in `lib/canvas-session`, so the drawing survives
 * leaving the view and two Canvas windows show the same one. This component
 * only paints it, turns pointer input into marks, and hands the finished sheet
 * to the export encoders — PNG, JPEG, WebP and BMP for the picture, TXT and RTF
 * for the words, and a sticky note on the Home board for the thought.
 */

const FONT_STACK = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** A sticky note holds one short line, so long text is split into several. */
const NOTE_LIMIT = 160;
const MAX_NOTE_CHUNKS = 6;

function tooLongForANote(value: string): boolean {
  return value.length > NOTE_LIMIT;
}

function paint(ctx: CanvasRenderingContext2D, item: CanvasItem): void {
  if (item.kind === 'text') {
    ctx.fillStyle = item.colour;
    ctx.font = `${item.size}px ${FONT_STACK}`;
    ctx.textBaseline = 'top';
    item.text.split('\n').forEach((line, index) => {
      ctx.fillText(line, item.at[0], item.at[1] + index * item.size * 1.25);
    });
    return;
  }
  ctx.strokeStyle = item.colour;
  ctx.lineWidth = item.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (item.kind === 'stroke') {
    const path = strokePath(item.points);
    if (!path) {
      const [x, y] = item.points[0] ?? [0, 0];
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, item.width / 2), 0, Math.PI * 2);
      ctx.fillStyle = item.colour;
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(path[0]!.x, path[0]!.y);
    for (const point of path.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  const [x0, y0] = item.from;
  const [x1, y1] = item.to;
  if (item.tool === 'line') {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  } else if (item.tool === 'rect') {
    ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  } else {
    ctx.ellipse(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      Math.abs(x1 - x0) / 2,
      Math.abs(y1 - y0) / 2,
      0,
      0,
      Math.PI * 2,
    );
  }
  ctx.stroke();
}

export function Canvas({
  isElectron,
  onBack,
  onToast,
  onAddNote,
  embedded = false,
}: {
  isElectron: boolean;
  onBack: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
  /** Adds a sticky note to the Home board; the sheet is where the words came from. */
  onAddNote: (text: string) => void;
  embedded?: boolean;
}) {
  const t = useT();
  const bridge = typeof window === 'undefined' ? undefined : window.kryvex;
  const { doc, prefs, canUndo, canRedo } = useCanvas();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftRef = useRef<CanvasItem | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== doc.width) canvas.width = doc.width;
    if (canvas.height !== doc.height) canvas.height = doc.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, doc.width, doc.height);
    for (const item of doc.items) paint(ctx, item);
    if (draftRef.current) paint(ctx, draftRef.current);
  }, [doc]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Undo and redo are keyboard-first here: drawing tools plus a mouse leave the
  // hand on the sheet, and Ctrl+Z is the one shortcut everybody already knows.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pointOf = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
      const box = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - box.left) / Math.max(1, box.width)) * doc.width;
      const y = ((event.clientY - box.top) / Math.max(1, box.height)) * doc.height;
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    },
    [doc.width, doc.height],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const at = pointOf(event);
      const tool = prefs.tool;
      if (tool === 'text') {
        const value = text.trim();
        if (!value) {
          onToast(t('Type the words below, then click the sheet to place them.'), 'warning');
          return;
        }
        updateDoc(current => ({
          ...current,
          items: [...current.items, { kind: 'text', colour: prefs.colour, size: prefs.fontSize, at, text: value }],
        }));
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* a synthetic or already-released pointer has nothing to capture */
      }
      if (tool === 'brush' || tool === 'eraser') {
        draftRef.current = {
          kind: 'stroke',
          tool,
          // The eraser paints the sheet's own ground, so a mark is really gone
          // rather than covered by a colour that only looks like the ground.
          colour: tool === 'eraser' ? doc.background : prefs.colour,
          width: tool === 'eraser' ? Math.max(prefs.width, 8) : prefs.width,
          points: [at],
        };
      } else {
        draftRef.current = {
          kind: 'shape',
          tool,
          colour: prefs.colour,
          width: prefs.width,
          from: at,
          to: at,
        };
      }
      redraw();
    },
    [pointOf, prefs, text, doc.background, redraw, t, onToast],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const draft = draftRef.current;
      if (!draft) return;
      const at = pointOf(event);
      if (draft.kind === 'stroke') {
        const last = draft.points[draft.points.length - 1];
        if (last && Math.abs(last[0] - at[0]) < 1 && Math.abs(last[1] - at[1]) < 1) return;
        draftRef.current = { ...draft, points: [...draft.points, at] };
      } else if (draft.kind === 'shape') {
        draftRef.current = { ...draft, to: at };
      }
      redraw();
    },
    [pointOf, redraw],
  );

  const finish = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const draft = draftRef.current;
      if (!draft) return;
      draftRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
      updateDoc(current => ({ ...current, items: [...current.items, draft] }));
    },
    [],
  );

  const bytesForExport = useCallback(
    async (format: 'png' | 'jpeg' | 'webp' | 'bmp'): Promise<Uint8Array | null> => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      if (format === 'bmp') {
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return encodeBmp(data.data, canvas.width, canvas.height);
      }
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, IMAGE_MIME[format], format === 'png' ? undefined : 0.92),
      );
      if (!blob) return null;
      return new Uint8Array(await blob.arrayBuffer());
    },
    [],
  );

  const saveBytes = useCallback(
    async (name: string, bytes: Uint8Array) => {
      if (!bridge?.filesSave) {
        onToast(t('Saving needs the desktop app.'), 'warning');
        return;
      }
      setBusy(t('Saving…'));
      try {
        const answer = await bridge.filesSave({
          items: [{ name, data: bytesToBase64(bytes) }],
        });
        if (answer.ok) {
          const saved = answer.saved[0];
          updatePrefs({ docName: (saved?.name ?? name).replace(/\.[A-Za-z0-9]{1,8}$/, '') });
          onToast(t('Saved {name}.', { name: saved?.name ?? name }), 'success');
        } else if (!answer.cancelled) {
          onToast(t('That file could not be written.'), 'danger');
        }
      } finally {
        setBusy('');
      }
    },
    [bridge, onToast, t],
  );

  const exportSheet = useCallback(async () => {
    const format = prefs.exportFormat;
    setBusy(t('Encoding…'));
    try {
      const bytes = await bytesForExport(format);
      if (!bytes) {
        onToast(t('The sheet could not be encoded.'), 'danger');
        return;
      }
      await saveBytes(documentNameOf(prefs.docName, format === 'jpeg' ? 'jpg' : format), bytes);
    } finally {
      setBusy('');
    }
  }, [prefs.exportFormat, prefs.docName, bytesForExport, saveBytes, onToast, t]);

  const exportText = useCallback(
    async (kind: 'txt' | 'rtf') => {
      const body = kind === 'txt' ? textOf(doc.items) : rtfOf(doc.items);
      if (!textOf(doc.items).trim()) {
        onToast(t('There is no typed text on the sheet yet.'), 'warning');
        return;
      }
      await saveBytes(documentNameOf(prefs.docName, kind), new TextEncoder().encode(body));
    },
    [doc.items, prefs.docName, saveBytes, onToast, t],
  );

  const openSheet = useCallback(async () => {
    if (!bridge?.filesPick) {
      onToast(t('Opening a sheet needs the desktop app.'), 'warning');
      return;
    }
    const answer = await bridge.filesPick({ kind: 'data', multiple: false });
    if (!answer.ok || answer.files.length === 0) {
      if (!answer.cancelled) onToast(t('No sheet was chosen.'), 'warning');
      return;
    }
    const file = answer.files[0]!;
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(base64ToBytes(file.data)));
      if (!replaceDoc(parsed)) {
        onToast(t('{name} is not a Kryvex sheet.', { name: file.name }), 'danger');
        return;
      }
      updatePrefs({ docName: file.name.replace(/\.[A-Za-z0-9]{1,8}$/, '') });
      onToast(t('{name} is open.', { name: file.name }), 'success');
    } catch {
      onToast(t('{name} could not be read.', { name: file.name }), 'danger');
    }
  }, [bridge, onToast, t]);

  const sendToNotes = useCallback(() => {
    const body = textOf(doc.items).trim();
    if (!body) {
      onToast(t('There is no typed text on the sheet yet.'), 'warning');
      return;
    }
    // A note is one short line; long text becomes several rather than one
    // truncated reminder.
    const chunks: string[] = [];
    const full = () => chunks.length >= MAX_NOTE_CHUNKS;
    for (const line of body.split('\n')) {
      let rest = line.trim();
      if (!rest) continue;
      while (tooLongForANote(rest) && !full()) {
        const cut = rest.lastIndexOf(' ', NOTE_LIMIT);
        const at = cut > 40 ? cut : NOTE_LIMIT;
        chunks.push(rest.slice(0, at));
        rest = rest.slice(at).trim();
      }
      if (rest && !full()) chunks.push(rest.slice(0, NOTE_LIMIT));
      if (full()) break;
    }
    if (chunks.length === 0) return;
    for (const chunk of chunks) onAddNote(chunk);
    onToast(t('Sent {count} note(s) to the Home board.', { count: chunks.length }), 'success');
  }, [doc.items, onAddNote, onToast, t]);

  const erased = useMemo(() => doc.items.length, [doc.items.length]);

  return (
    <section className={`view canvas-view ${embedded ? 'is-embedded' : ''}`}>
      {embedded ? null : (
        <header className="view-head">
          <div>
            <p className="eyebrow mono">{t('x537 / CANVAS')}</p>
            {/* A product name: the same in every language, so it is not a key. */}
            <h1>Canvas</h1>
            <p className="lede">
              {t(
                'Draw, sketch and type on a sheet that stays on this machine. Save it as an image, send its words to a sticky note, or keep the sheet itself to carry on later.',
              )}
            </p>
          </div>
          <div className="view-head-actions">
            <button className="btn ghost" onClick={onBack}>
              <Icon name="back" size={15} />
              {t('Back to services')}
            </button>
          </div>
        </header>
      )}

      <div className="canvas-bar">
        <div className="canvas-tools" role="group" aria-label={t('Tools')}>
          {CANVAS_TOOLS.map(tool => (
            <button
              key={tool}
              className={`btn ghost small ${prefs.tool === tool ? 'is-active' : ''}`}
              aria-pressed={prefs.tool === tool}
              onClick={() => updatePrefs({ tool })}
            >
              {t(
                tool === 'brush'
                  ? 'Brush'
                  : tool === 'eraser'
                    ? 'Eraser'
                    : tool === 'line'
                      ? 'Line'
                      : tool === 'rect'
                        ? 'Rectangle'
                        : tool === 'ellipse'
                          ? 'Ellipse'
                          : 'Text',
              )}
            </button>
          ))}
        </div>

        <div className="canvas-swatches" role="group" aria-label={t('Colour')}>
          {CANVAS_COLOURS.map(colour => (
            <button
              key={colour}
              className={`canvas-swatch ${prefs.colour === colour ? 'is-on' : ''}`}
              style={{ background: colour }}
              aria-label={t('Colour {value}', { value: colour })}
              aria-pressed={prefs.colour === colour}
              onClick={() => updatePrefs({ colour })}
            />
          ))}
        </div>

        <div className="canvas-widths" role="group" aria-label={t('Stroke size')}>
          {CANVAS_WIDTHS.map(width => (
            <button
              key={width}
              className={`btn ghost small ${prefs.width === width ? 'is-active' : ''}`}
              aria-pressed={prefs.width === width}
              onClick={() => updatePrefs({ width })}
            >
              {width}px
            </button>
          ))}
        </div>

        <div className="canvas-history">
          <button className="btn secondary small" onClick={undo} disabled={!canUndo}>
            <Icon name="back" size={13} />
            {t('Undo')}
          </button>
          <button className="btn secondary small" onClick={redo} disabled={!canRedo}>
            <Icon name="forward" size={13} />
            {t('Redo')}
          </button>
          <button
            className="btn ghost small"
            onClick={() => updateDoc(current => ({ ...current, items: [] }))}
            disabled={erased === 0}
          >
            <Icon name="trash" size={13} />
            {t('Clear the sheet')}
          </button>
        </div>
      </div>

      <div className="canvas-stage">
        <canvas
          ref={canvasRef}
          className={`canvas-sheet tool-${prefs.tool}`}
          width={doc.width}
          height={doc.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          aria-label={t('Drawing sheet')}
          role="img"
        />
      </div>

      {prefs.tool === 'text' ? (
        <div className="canvas-text">
          <label className="forge-field">
            <span className="mono forge-label">{t('Text to place')}</span>
            <textarea value={text} onChange={event => setText(event.target.value)} rows={2} />
          </label>
          <label className="forge-field">
            <span className="mono forge-label">{t('Text size {size}px', { size: prefs.fontSize })}</span>
            <input
              type="range"
              min={12}
              max={96}
              value={prefs.fontSize}
              onChange={event => updatePrefs({ fontSize: Number(event.target.value) })}
            />
          </label>
        </div>
      ) : null}

      <div className="canvas-foot">
        <div className="canvas-export">
          <span className="mono forge-label">{t('Export')}</span>
          <div className="forge-chips">
            {CANVAS_EXPORTS.map(format => (
              <button
                key={format}
                className={`btn ghost small ${prefs.exportFormat === format ? 'is-active' : ''}`}
                aria-pressed={prefs.exportFormat === format}
                onClick={() => updatePrefs({ exportFormat: format })}
              >
                {format === 'jpeg' ? 'JPG' : format.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="btn primary small" onClick={() => void exportSheet()} disabled={Boolean(busy)}>
            <Icon name="download" size={14} />
            {t('Save a copy')}
          </button>
        </div>

        <div className="canvas-doc">
          <span className="mono forge-label">{t('Words')}</span>
          <button className="btn secondary small" onClick={() => void exportText('txt')}>
            {t('Text file')}
          </button>
          <button className="btn secondary small" onClick={() => void exportText('rtf')}>
            {t('Rich text')}
          </button>
          <button className="btn secondary small" onClick={sendToNotes}>
            <Icon name="note" size={13} />
            {t('Send to sticky notes')}
          </button>
        </div>

        <div className="canvas-sheet-actions">
          <span className="mono forge-label">{t('Sheet')}</span>
          <button className="btn secondary small" onClick={() => void openSheet()}>
            <Icon name="folder" size={13} />
            {t('Open a sheet')}
          </button>
          <button
            className="btn secondary small"
            onClick={() =>
              void saveBytes(
                documentNameOf(prefs.docName, 'kxcanvas'),
                new TextEncoder().encode(JSON.stringify(doc)),
              )
            }
          >
            <Icon name="check" size={13} />
            {t('Keep the sheet')}
          </button>
          <div className="forge-chips">
            {CANVAS_PRESETS.map(preset => (
              <button
                key={preset.id}
                className="btn ghost small"
                onClick={() => resetDoc(preset.width, preset.height)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="canvas-ground">
          <span className="mono forge-label">{t('Ground')}</span>
          <div className="forge-chips">
            {CANVAS_BACKGROUNDS.map(colour => (
              <button
                key={colour}
                className={`canvas-swatch ${doc.background === colour ? 'is-on' : ''}`}
                style={{ background: colour }}
                aria-label={t('Ground {value}', { value: colour })}
                aria-pressed={doc.background === colour}
                onClick={() => {
                  updatePrefs({ background: colour });
                  updateDoc(current => ({ ...current, background: colour }), { history: false });
                }}
              />
            ))}
          </div>
        </div>

        {busy ? <span className="mono forge-busy">{busy}</span> : null}
      </div>

      {isElectron ? null : (
        <p className="forge-hint">
          {t('The sheet is drawn in this tab and kept for the session: saving it needs the desktop app.')}
        </p>
      )}
    </section>
  );
}
