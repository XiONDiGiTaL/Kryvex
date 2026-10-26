/**
 * Floating service windows.
 *
 * A floated module keeps the same `<webview>`: only its box changes from
 * "fills the stage" to "a fixed rectangle", so the site is never reloaded by
 * the move. The geometry rules live here, away from React, because they are
 * about the window staying usable — a title bar you can still grab, a body you
 * can still read — not about the component that draws it.
 */

export interface FloatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloatViewport {
  width: number;
  height: number;
}

/** Below this a module is a strip, not a window. */
export const MIN_FLOAT_WIDTH = 380;
export const MIN_FLOAT_HEIGHT = 280;
/** How much of the title bar has to stay reachable after a drag. */
export const MIN_VISIBLE_X = 140;
export const MIN_VISIBLE_Y = 44;

/**
 * Every service window is painted inside this band.
 *
 * Kryvex's own chrome owns fixed layers above it: modals 50, palette 60,
 * toasts 70, the theme gallery 80 and the service context menu 90. A window
 * that keeps incrementing its own z-index eventually covers a dialog, which is
 * how a "Bring to front" button ends up hiding the menu that was clicked. The
 * band is bounded, and `raise` renumbers inside it instead of climbing forever.
 */
export const MIN_WINDOW_Z = 30;
export const MAX_WINDOW_Z = 45;

/** Which edge or corner a resize gesture starts from. */
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function limit(value: number, low: number, high: number): number {
  // A bounds smaller than the minimum still has to produce a usable number.
  const ceiling = Math.max(low, high);
  return Math.min(Math.max(low, value), ceiling);
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Pins a rectangle to the viewport. The top edge stays below the app chrome and
 * at least a strip of the title bar stays on screen, so a window can never be
 * dragged somewhere it cannot be grabbed back from.
 */
export function clampFloatRect(rect: FloatRect, viewport: FloatViewport): FloatRect {
  const maxWidth = Math.max(MIN_FLOAT_WIDTH, finite(viewport.width, MIN_FLOAT_WIDTH));
  const maxHeight = Math.max(MIN_FLOAT_HEIGHT, finite(viewport.height, MIN_FLOAT_HEIGHT));
  const width = Math.min(Math.max(MIN_FLOAT_WIDTH, finite(rect.width, MIN_FLOAT_WIDTH)), maxWidth);
  const height = Math.min(
    Math.max(MIN_FLOAT_HEIGHT, finite(rect.height, MIN_FLOAT_HEIGHT)),
    maxHeight,
  );
  const x = Math.min(
    Math.max(MIN_VISIBLE_X - width, finite(rect.x, 0)),
    maxWidth - MIN_VISIBLE_X,
  );
  const y = Math.min(Math.max(0, finite(rect.y, 0)), maxHeight - MIN_VISIBLE_Y);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Bottom-right, leaving the sidebar and the app chrome uncovered. */
export function defaultFloatRect(viewport: FloatViewport): FloatRect {
  const width = Math.max(MIN_FLOAT_WIDTH, Math.round(finite(viewport.width, 1280) * 0.56));
  const height = Math.max(MIN_FLOAT_HEIGHT, Math.round(finite(viewport.height, 800) * 0.66));
  return clampFloatRect(
    {
      x: Math.max(0, finite(viewport.width, 1280) - width - 40),
      y: Math.max(0, finite(viewport.height, 800) - height - 40),
      width,
      height,
    },
    viewport,
  );
}

export function dragFloat(rect: FloatRect, dx: number, dy: number, viewport: FloatViewport): FloatRect {
  return clampFloatRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, viewport);
}

export function resizeFloat(
  rect: FloatRect,
  dx: number,
  dy: number,
  viewport: FloatViewport,
): FloatRect {
  return clampFloatRect({ ...rect, width: rect.width + dx, height: rect.height + dy }, viewport);
}

/** A cascade, so a second floated module does not hide the first one whole. */
export function cascadeFloat(rect: FloatRect, index: number, viewport: FloatViewport): FloatRect {
  const step = 28;
  return clampFloatRect(
    { ...rect, x: rect.x - index * step, y: rect.y - index * step },
    viewport,
  );
}

/**
 * A window on the workspace canvas is contained, not merely reachable: it may
 * never hang over the edge of the surface it lives on. That is the difference
 * from a detached float, which is allowed to leave part of itself off-screen so
 * long as its title bar can still be grabbed.
 */
export function clampCanvasRect(rect: FloatRect, bounds: FloatViewport): FloatRect {
  const maxWidth = Math.max(MIN_FLOAT_WIDTH, Math.round(finite(bounds.width, MIN_FLOAT_WIDTH)));
  const maxHeight = Math.max(MIN_FLOAT_HEIGHT, Math.round(finite(bounds.height, MIN_FLOAT_HEIGHT)));
  const width = Math.min(Math.max(MIN_FLOAT_WIDTH, finite(rect.width, MIN_FLOAT_WIDTH)), maxWidth);
  const height = Math.min(
    Math.max(MIN_FLOAT_HEIGHT, finite(rect.height, MIN_FLOAT_HEIGHT)),
    maxHeight,
  );
  return {
    x: Math.round(limit(finite(rect.x, 0), 0, maxWidth - width)),
    y: Math.round(limit(finite(rect.y, 0), 0, maxHeight - height)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * One edge or corner of a canvas window, moved by a pointer delta.
 *
 * The dragged edge is what follows the pointer; the opposite edge stays put,
 * so a west drag moves `x` and changes the width together. Every edge is
 * clamped against the canvas and against the minimum size, which is why this
 * lives next to the other geometry rules rather than in the component.
 */
export function resizeEdges(
  rect: FloatRect,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  bounds: FloatViewport,
): FloatRect {
  const maxWidth = Math.max(MIN_FLOAT_WIDTH, Math.round(finite(bounds.width, MIN_FLOAT_WIDTH)));
  const maxHeight = Math.max(MIN_FLOAT_HEIGHT, Math.round(finite(bounds.height, MIN_FLOAT_HEIGHT)));
  const left0 = finite(rect.x, 0);
  const top0 = finite(rect.y, 0);
  const right0 = left0 + Math.max(MIN_FLOAT_WIDTH, finite(rect.width, MIN_FLOAT_WIDTH));
  const bottom0 = top0 + Math.max(MIN_FLOAT_HEIGHT, finite(rect.height, MIN_FLOAT_HEIGHT));

  let left = left0;
  let top = top0;
  let right = right0;
  let bottom = bottom0;

  if (direction.includes('e')) right = limit(right0 + dx, left0 + MIN_FLOAT_WIDTH, maxWidth);
  if (direction.includes('s')) bottom = limit(bottom0 + dy, top0 + MIN_FLOAT_HEIGHT, maxHeight);
  if (direction.includes('w')) left = limit(left0 + dx, 0, right0 - MIN_FLOAT_WIDTH);
  if (direction.includes('n')) top = limit(top0 + dy, 0, bottom0 - MIN_FLOAT_HEIGHT);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

export function floatWindowStyle(rect: FloatRect, z: number): Record<string, string | number> {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: z,
  };
}
