import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import {
  isServiceDrag,
  isToolDrag,
  isViewDrag,
  readViewDrag,
  readServiceDrag,
  readToolDrag,
  requestServiceDropEffect,
} from '../lib/service-drag';
import type { ViewWindowId } from '../lib/tool-windows';
import type { SecretToolId } from '../types';
import { Icon } from '../components/ui';
import type { WindowMap } from '../lib/workspace';
import type { WindowMotion, WorkspaceSettings } from '../types';

/** The three motions, in the order the panel offers them. */
const MOTIONS: Array<{ id: WindowMotion; label: string }> = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'bouncy', label: 'Bouncy' },
  { id: 'none', label: 'None' },
];

const SPEEDS = [0.5, 1, 1.5, 2];

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
  motion,
  onRect,
  onAdd,
  onDropService,
  onDropTool,
  onDropView,
  onMotion,
}: {
  windows: WindowMap;
  motion: WorkspaceSettings;
  onRect: (rect: CanvasRect | null) => void;
  onAdd: () => void;
  onDropService: (id: string, at: { x: number; y: number }) => void;
  /** A pinned built-in tool dragged in from the rail. */
  onDropTool: (tool: SecretToolId, at: { x: number; y: number }) => void;
  onDropView: (view: ViewWindowId, at: { x: number; y: number }) => void;
  onMotion: (patch: Partial<WorkspaceSettings>) => void;
}) {
  const t = useT();
  const canvas = useRef<HTMLDivElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const [panel, setPanel] = useState(false);

  // Escape closes the motion panel; a click inside it must not need the button.
  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);
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
        <button
          className={`btn secondary small ${panel ? 'is-active' : ''}`}
          onClick={() => setPanel(value => !value)}
          aria-expanded={panel}
          title={t('Window animation')}
        >
          <Icon name="sliders" size={14} />
          {t('Window animation')}
        </button>
        <button className="btn secondary small" onClick={onAdd}>
          <Icon name="plus" size={14} />
          {t('Add service')}
        </button>
      </header>

      {panel ? (
        <div className="workspace-motion" role="group" aria-label={t('Window animation')}>
          <p className="mono workspace-motion-label">{t('Window animation')}</p>
          <div className="workspace-motion-row">
            {MOTIONS.map(option => (
              <button
                key={option.id}
                className={`btn ghost small ${motion.motion === option.id ? 'is-active' : ''}`}
                aria-pressed={motion.motion === option.id}
                onClick={() => onMotion({ motion: option.id })}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          {motion.motion === 'none' ? null : (
            <>
              <p className="mono workspace-motion-label">{t('Animation speed')}</p>
              <div className="workspace-motion-row">
                {SPEEDS.map(speed => (
                  <button
                    key={speed}
                    className={`btn ghost small ${motion.motionSpeed === speed ? 'is-active' : ''}`}
                    aria-pressed={motion.motionSpeed === speed}
                    onClick={() => onMotion({ motionSpeed: speed })}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      <div
        ref={canvas}
        className={`workspace-canvas ${dropping ? 'is-drop' : ''} ${empty ? 'is-empty' : ''}`}
        onDragOver={event => {
          if (
            !isServiceDrag(event.dataTransfer) &&
            !isToolDrag(event.dataTransfer) &&
            !isViewDrag(event.dataTransfer)
          ) {
            return;
          }
          event.preventDefault();
          // Never demand an effect the source refuses: that cancels the drop
          // outright. The request follows the source instead, which is what lets
          // a pinned row (which drags as `copyMove`) land here as a copy.
          requestServiceDropEffect(event.dataTransfer);
          if (!dropping) setDropping(true);
        }}
        onDragLeave={event => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropping(false);
        }}
        onDrop={event => {
          const view = readViewDrag(event.dataTransfer);
          const tool = view ? null : readToolDrag(event.dataTransfer);
          const id = view || tool ? null : readServiceDrag(event.dataTransfer);
          setDropping(false);
          if (!view && !tool && !id) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          const at = { x: event.clientX - box.left, y: event.clientY - box.top };
          if (view) onDropView(view, at);
          else if (tool) onDropTool(tool, at);
          else if (id) onDropService(id, at);
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
