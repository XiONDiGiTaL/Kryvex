import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { isServiceDrag, readServiceDrag } from '../lib/service-drag';
import { Icon } from '../components/ui';
import type { WindowMap } from '../lib/workspace';

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The Workspace surface.
 *
 * This view owns nothing but a rectangle: the wallpaper, the empty state and
 * the drop target. Every service window is drawn by the stage the shell already
 * mounts, positioned over this rectangle, so opening a service here never makes
 * a second copy of it — the same guest, the same partition, the same sign-in.
 *
 * The rectangle is reported to the shell because the window board is a sibling
 * of this view, not a child of it: the stage needs the box in viewport pixels to
 * place itself, and it is clamped on every resize so a window can never end up
 * outside the surface it belongs to.
 */
export function Workspace({
  windows,
  onRect,
  onAdd,
  onDropService,
}: {
  windows: WindowMap;
  onRect: (rect: CanvasRect | null) => void;
  onAdd: () => void;
  onDropService: (id: string, at: { x: number; y: number }) => void;
}) {
  const t = useT();
  const canvas = useRef<HTMLDivElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const open = Object.values(windows).filter(entry => entry.kind === 'canvas');
  const empty = open.length === 0;

  // The stage is positioned from this measurement, so it is reported on mount,
  // on every canvas resize and on a window resize; the cleanup clears it so a
  // route change cannot leave windows floating over another view.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const report = () => {
      const box = element.getBoundingClientRect();
      onRect({ left: box.left, top: box.top, width: box.width, height: box.height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      onRect(null);
    };
  }, [onRect]);

  return (
    <section className="view workspace-view" aria-label={t('Workspace')}>
      {/* Above the canvas, never over it: the board is drawn on its own layer
          above this view, so a control inside the surface can be covered by the
          very window it is meant to add. */}
      <header className="workspace-bar">
        <p className="workspace-label mono">{t('Workspace')}</p>
        <span className="workspace-count mono">
          {open.length === 0 ? null : t('{count} WINDOWS', { count: open.length })}
        </span>
        <button className="btn secondary small" onClick={onAdd}>
          <Icon name="plus" size={14} />
          {t('Add service')}
        </button>
      </header>

      <div
        ref={canvas}
        className={`workspace-canvas ${dropping ? 'is-drop' : ''} ${empty ? 'is-empty' : ''}`}
        onDragOver={event => {
          if (!isServiceDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          if (!dropping) setDropping(true);
        }}
        onDragLeave={event => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropping(false);
        }}
        onDrop={event => {
          const id = readServiceDrag(event.dataTransfer);
          setDropping(false);
          if (!id) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          onDropService(id, { x: event.clientX - box.left, y: event.clientY - box.top });
        }}
      >
        {empty ? (
          <div className="workspace-empty">
            <span className="workspace-empty-mark" aria-hidden="true">
              <Icon name="monitor" size={26} />
            </span>
            <h2>{t('Add services here to display them.')}</h2>
            <p>{t('Drag a pinned service here, or add one.')}</p>
            <button className="btn primary" onClick={onAdd}>
              <Icon name="plus" size={14} />
              {t('Add service')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
