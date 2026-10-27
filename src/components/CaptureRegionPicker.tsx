import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureKind } from '../types';
import { useI18n } from '../lib/i18n';
import {
  fitSize,
  pickerArena,
  regionFromDrag,
  regionLabel,
  regionRect,
  type CaptureRegion,
  type Point,
  type Size,
} from '../lib/capture-region';
import { Icon } from './ui';

/**
 * The area picker: one frozen frame of the target, with a box to drag over it.
 *
 * A snipping tool freezes the screen before it asks, and so does this. The frame
 * is grabbed once, when the picker opens, and the picture shown is a still of it
 * — which is what makes the result honest: the overlay cannot end up inside the
 * capture, because the capture is taken from the frozen frame, not from the
 * screen underneath a selection box that is painted over it.
 *
 * The drag is reported back in the frame's own pixels. The picker draws its box
 * from that same region, so what is marked is what a capture will take, whatever
 * scale the frozen frame happens to be drawn at.
 */
export function CaptureRegionPicker({
  imageUrl,
  source,
  target,
  kind,
  onConfirm,
  onCancel,
}: {
  /** Object URL of the frozen frame. */
  imageUrl: string;
  /** The frozen frame's own pixel size. */
  source: Size;
  /** What is being captured, for the title. */
  target: string;
  kind: CaptureKind;
  onConfirm: (region: CaptureRegion) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [viewport, setViewport] = useState<Size>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [shape, setShape] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [draft, setDraft] = useState<CaptureRegion | null>(null);
  const [refused, setRefused] = useState(false);
  const dragging = useRef<Point | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Escape leaves, Enter confirms, exactly as the picker's own buttons do.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === 'Enter' && draft) {
        event.preventDefault();
        onConfirm(draft);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, onCancel, onConfirm]);

  const frame = useMemo(() => fitSize(source, pickerArena(viewport)), [source, viewport]);
  const ready = frame.width > 0 && frame.height > 0;
  // The box is drawn from the region once there is one, and from the raw drag
  // while the pointer is still down.
  const box = draft ? regionRect(draft, frame, source) : shape;

  /** Where the pointer is, in the frozen frame's displayed coordinates. */
  function pointAt(event: React.PointerEvent<HTMLDivElement>): Point {
    const rect = (stage.current ?? event.currentTarget).getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function held(start: Point, end: Point): { left: number; top: number; width: number; height: number } {
    const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);
    const left = clamp(Math.min(start.x, end.x), frame.width);
    const top = clamp(Math.min(start.y, end.y), frame.height);
    const right = clamp(Math.max(start.x, end.x), frame.width);
    const bottom = clamp(Math.max(start.y, end.y), frame.height);
    return { left, top, width: right - left, height: bottom - top };
  }

  function settle(start: Point, end: Point): void {
    const region = regionFromDrag(start, end, frame, source);
    setDraft(region);
    setShape(region ? regionRect(region, frame, source) : held(start, end));
    setRefused(!region);
  }

  function down(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !ready) return;
    try {
      // So the drag keeps arriving when the pointer leaves the frame.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* a pointer the browser does not know about still drags inside it */
    }
    dragging.current = pointAt(event);
    setDraft(null);
    setRefused(false);
    setShape({ left: dragging.current.x, top: dragging.current.y, width: 0, height: 0 });
  }

  function move(event: React.PointerEvent<HTMLDivElement>): void {
    const start = dragging.current;
    if (!start) return;
    const now = pointAt(event);
    const region = regionFromDrag(start, now, frame, source);
    setShape(region ? regionRect(region, frame, source) : held(start, now));
    setDraft(region);
  }

  function up(event: React.PointerEvent<HTMLDivElement>): void {
    const start = dragging.current;
    if (!start) return;
    dragging.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* never captured, or the pointer is already gone */
    }
    settle(start, pointAt(event));
  }

  return (
    <div
      className="capture-region-layer"
      role="dialog"
      aria-modal="true"
      aria-label={t('Choose the area to capture')}
    >
      <div className="capture-region-bar">
        <Icon name="camera" size={14} />
        <strong>{target}</strong>
        <span className="mono capture-region-size">
          {draft ? regionLabel(draft) : `${source.width} × ${source.height}`}
        </span>
      </div>

      <div
        ref={stage}
        className="capture-region-stage"
        style={{ width: `${frame.width}px`, height: `${frame.height}px` }}
      >
        <img src={imageUrl} alt={t('The target, frozen for selection')} draggable={false} />
        <div
          className="capture-region-drag"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {box && box.width > 0 && box.height > 0 ? (
          <div
            className="capture-region-box"
            style={{
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
          />
        ) : null}
      </div>

      <p className="capture-region-hint">
        {refused
          ? t('The area is too small. Drag a larger box.')
          : draft
            ? t('{size} selected.', { size: regionLabel(draft) })
            : t('Drag across the part you want to capture, then confirm.')}
      </p>

      <div className="capture-region-actions">
        <button
          type="button"
          className="btn primary small"
          disabled={!draft}
          onClick={() => {
            if (draft) onConfirm(draft);
          }}
        >
          <Icon name={kind === 'clip' ? 'record' : 'camera'} size={13} />{' '}
          {kind === 'clip' ? t('Record this area') : t('Capture this area')}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}
