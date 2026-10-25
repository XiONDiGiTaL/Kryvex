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

export function floatWindowStyle(rect: FloatRect, z: number): Record<string, string | number> {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: z,
  };
}
