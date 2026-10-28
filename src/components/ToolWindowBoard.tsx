import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SecretToolId, WorkspaceSettings } from '../types';
import { ElementMark } from './ElementMark';
import { Icon } from './ui';
import { useT } from '../lib/i18n';
import { SECRET_TOOL_LABELS } from '../lib/secret-tools';
import {
  builtInWindowOfId,
  toolOfWindowId,
  type ViewWindowId,
} from '../lib/tool-windows';
import {
  canvasWindowStyle,
  minimizedWindows,
  windowsOfKind,
  type ServiceWindow,
  type WindowMap,
} from '../lib/workspace';
import { floatWindowStyle, type ResizeDirection } from '../lib/floating';

/**
 * The board for windows that hold no service.
 *
 * Two kinds of guest arrive here: a built-in tool (Arcade, File Forge, Canvas)
 * and a view popped out of the app (Rooms). It is a sibling of the service
 * stage, draws in the same band, and reuses the same window classes, so these
 * windows are framed, moved, resized and stacked exactly like a service window:
 * one set of rules, three kinds of guest.
 *
 * The guest is a Kryvex component, not a `<webview>`. That is why a window here
 * can be raised, minimized and restored without a reload: there is nothing to
 * reload.
 */

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function ToolWindowBoard({
  windows,
  canvas,
  motion,
  onMove,
  onResize,
  onRaise,
  onClose,
  onMinimize,
  onMaximize,
  onDockView,
  renderTool,
  renderView,
}: {
  windows: WindowMap;
  /** The measured Workspace surface, or null when it is not on screen. */
  canvas: CanvasRect | null;
  motion: WorkspaceSettings;
  onMove: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, direction: ResizeDirection, dx: number, dy: number) => void;
  onRaise: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  /** Puts a popped-out view back on its own route. */
  onDockView: (view: ViewWindowId) => void;
  /** The guest for one tool, rendered inside the frame. */
  renderTool: (tool: SecretToolId) => ReactNode;
  /** The guest for one popped-out view, rendered inside the frame. */
  renderView: (view: ViewWindowId) => ReactNode;
}) {
  const t = useT();
  const ids = Object.keys(windows).filter(id => builtInWindowOfId(id) !== null);
  const shown = ids.filter(id => {
    const entry = windows[id];
    if (!entry) return false;
    if (entry.kind === 'canvas') return canvas !== null;
    return true;
  });
  const minimized = minimizedWindows(windows, canvas ? 'canvas' : 'detached').filter(
    id => builtInWindowOfId(id) !== null,
  );

  if (shown.length === 0 && minimized.length === 0) return null;

  return (
    <section
      className="service-stage is-canvas is-tool-stage"
      style={
        canvas
          ? {
              left: canvas.left,
              top: canvas.top,
              width: canvas.width,
              height: canvas.height,
              zIndex: 25,
            }
          : undefined
      }
      aria-label={t('Built-in tool windows')}
    >
      {shown.map(id => {
        const entry = windows[id];
        const builtIn = builtInWindowOfId(id);
        if (!entry || !builtIn) return null;
        const tool = builtIn.kind === 'tool' ? builtIn.tool : null;
        const name = tool ? t(SECRET_TOOL_LABELS[tool]) : t('Rooms');
        return (
          <ToolFrame
            key={id}
            id={id}
            name={name}
            tool={tool}
            entry={entry}
            motion={motion}
            onMove={onMove}
            onResize={onResize}
            onRaise={onRaise}
            onClose={onClose}
            onMinimize={onMinimize}
            onMaximize={onMaximize}
            onDock={builtIn.kind === 'view' ? () => onDockView(builtIn.view) : undefined}
          >
            {builtIn.kind === 'tool' ? renderTool(builtIn.tool) : renderView(builtIn.view)}
          </ToolFrame>
        );
      })}

      {minimized.length > 0 ? (
        <div className="workspace-tray" role="group" aria-label={t('Minimized windows')}>
          {minimized.map(id => {
            const builtIn = builtInWindowOfId(id);
            if (!builtIn) return null;
            const tool = builtIn.kind === 'tool' ? builtIn.tool : null;
            const name = tool ? t(SECRET_TOOL_LABELS[tool]) : t('Rooms');
            return (
              <button
                key={id}
                className="workspace-tray-item"
                onClick={() => onMinimize(id)}
                title={name}
                aria-label={t('Restore {name}', { name })}
              >
                {tool ? <ElementMark tool={tool} size={22} compact /> : <Icon name="monitor" size={16} />}
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function ToolFrame({
  id,
  name,
  tool,
  entry,
  motion,
  onMove,
  onResize,
  onRaise,
  onClose,
  onMinimize,
  onMaximize,
  onDock,
  children,
}: {
  id: string;
  /** The title bar's own label; a tool's name, or the view's. */
  name: string;
  /** Null for a view window, which carries the app mark instead. */
  tool: SecretToolId | null;
  entry: ServiceWindow;
  motion: WorkspaceSettings;
  onMove: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, direction: ResizeDirection, dx: number, dy: number) => void;
  onRaise: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  /** Only a view window carries this: its route is where it came from. */
  onDock?: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const isWindow = entry.kind === 'canvas';
  const minimized = Boolean(entry.minimized);
  const motionMs =
    motion.motion === 'none'
      ? 0
      : Math.round((motion.motion === 'bouncy' ? 260 : 170) / Math.max(0.5, motion.motionSpeed));
  const [entering, setEntering] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (minimized || motionMs === 0) return;
    setEntering(true);
    const timer = window.setTimeout(() => setEntering(false), motionMs);
    return () => window.clearTimeout(timer);
  }, [minimized, motionMs]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  function requestClose() {
    if (closing) return;
    if (motionMs === 0) {
      onClose(id);
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      onClose(id);
    }, motionMs);
  }

  /** A drag travels over the tool's own surface, so the pointer is captured. */
  function beginDrag(event: React.PointerEvent<HTMLElement>) {
    if (minimized) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [role="menu"], canvas')) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is an optimisation; the window listeners follow anyway */
    }
    let lastX = event.clientX;
    let lastY = event.clientY;
    const move = (next: PointerEvent) => {
      onMove(id, next.clientX - lastX, next.clientY - lastY);
      lastX = next.clientX;
      lastY = next.clientY;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function beginResize(event: React.PointerEvent<HTMLElement>, direction: ResizeDirection) {
    if (minimized) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is an optimisation; the window listeners follow anyway */
    }
    let lastX = event.clientX;
    let lastY = event.clientY;
    const move = (next: PointerEvent) => {
      onResize(id, direction, next.clientX - lastX, next.clientY - lastY);
      lastX = next.clientX;
      lastY = next.clientY;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  return (
    <div
      className={`service-frame is-active is-tool-window ${entry.kind === 'detached' ? 'is-floating' : 'is-window'} ${
        minimized ? 'is-minimized' : ''
      } ${entering ? 'is-opening' : ''} ${closing ? 'is-closing' : ''}`}
      style={
        {
          ...(isWindow ? canvasWindowStyle(entry.rect, entry.z) : floatWindowStyle(entry.rect, entry.z)),
          '--window-motion': `${motionMs}ms`,
        } as React.CSSProperties
      }
      data-motion={motion.motion}
      // A service frame is addressed by `data-service`; a built-in window has no
      // service record, so it carries the map id the drop placed it under.
      data-window={id}
      onPointerDown={() => {
        if (!minimized) onRaise(id);
      }}
    >
      <header className="service-toolbar" onPointerDown={beginDrag}>
        {tool ? (
          <ElementMark tool={tool} size={30} compact />
        ) : (
          <span
            className="element-tile is-view"
            style={{ '--tile-size': '30px' } as React.CSSProperties}
            role="img"
            aria-label={t('Kryvex view')}
          >
            <Icon name="monitor" size={15} />
          </span>
        )}
        <div className="service-id">
          <div className="service-title-line">
            <h1>{name}</h1>
            <span className="tag mono">{t('BUILT IN')}</span>
          </div>
          <span className="mono service-url">{tool ? t('Kryvex tool') : t('Kryvex view')}</span>
        </div>
        <div className="service-actions">
          {/* A popped-out room is a window over the app, and the control that
              brings it back used to live only on the route behind it — which a
              maximized window covers. It belongs on the window. */}
          {onDock ? (
            <button
              className="btn ghost small window-dock"
              onClick={onDock}
              title={t('Bring it back')}
            >
              <Icon name="monitor" size={13} />
              {t('Bring it back')}
            </button>
          ) : null}
          <span className="window-controls">
            <button
              className="icon-btn"
              onClick={() => onMinimize(id)}
              title={t('Minimize')}
              aria-label={t('Minimize')}
            >
              <span className="window-glyph" aria-hidden="true">
                −
              </span>
            </button>
            <button
              className="icon-btn"
              onClick={() => onMaximize(id)}
              title={entry.restore ? t('Restore') : t('Maximize')}
              aria-label={entry.restore ? t('Restore') : t('Maximize')}
            >
              <span className="window-glyph" aria-hidden="true">
                {entry.restore ? '❐' : '□'}
              </span>
            </button>
            <button
              className="icon-btn danger"
              onClick={requestClose}
              title={t('Close')}
              aria-label={t('Close')}
            >
              <Icon name="close" size={14} />
            </button>
          </span>
        </div>
      </header>

      <div className="service-canvas tool-window-body">{children}</div>

      {isWindow ? (
        (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDirection[]).map(direction => (
          <span
            key={direction}
            className={`service-window-edge is-${direction}`}
            aria-hidden="true"
            onPointerDown={event => beginResize(event, direction)}
          />
        ))
      ) : (
        <span
          className="service-float-resize"
          role="separator"
          aria-label={t('Resize this window')}
          title={t('Drag to resize')}
          tabIndex={0}
          onPointerDown={event => beginResize(event, 'se')}
        />
      )}
    </div>
  );
}

/** Only for the tray: the ids of tool windows that exist in the map. */
export function toolWindowIds(windows: WindowMap, kind: 'canvas' | 'detached'): string[] {
  return windowsOfKind(windows, kind).filter(id => toolOfWindowId(id) !== null);
}
