import {
  MAX_WINDOW_Z,
  MIN_FLOAT_HEIGHT,
  MIN_FLOAT_WIDTH,
  MIN_WINDOW_Z,
  cascadeFloat,
  clampCanvasRect,
  clampFloatRect,
  defaultFloatRect,
  dragFloat,
  resizeEdges,
  resizeFloat,
  type FloatRect,
  type FloatViewport,
  type ResizeDirection,
} from './floating';

/**
 * Service windows.
 *
 * One map holds every window Kryvex has open, in both places a service can be
 * framed:
 *
 * - `canvas`   — a window on the Workspace surface, positioned in canvas pixels
 *                and contained by it;
 * - `detached` — a module floated over the rest of the app, positioned in
 *                viewport pixels and only kept reachable.
 *
 * The transitions live here so the shell never does window arithmetic inline,
 * and so the stacking rule is one function instead of one increment per click.
 * A window is never a copy of a service: the guest stays mounted in the stage,
 * and these records only describe its box.
 */
export type WindowKind = 'canvas' | 'detached';

export interface ServiceWindow {
  kind: WindowKind;
  rect: FloatRect;
  z: number;
  /** Geometry to return to after a maximize, while the window fills the canvas. */
  restore?: FloatRect;
  minimized?: boolean;
}

export type WindowMap = Record<string, ServiceWindow>;

/** The two surfaces a window can be measured against, in CSS pixels. */
export interface WindowSpace {
  viewport: FloatViewport;
  canvas: FloatViewport | null;
}

function kindBounds(kind: WindowKind, space: WindowSpace): FloatViewport {
  // Before the Workspace has been measured the viewport is a safe stand-in:
  // the canvas effect clamps whatever landed outside once the real box arrives.
  return kind === 'canvas' ? (space.canvas ?? space.viewport) : space.viewport;
}

function clampFor(kind: WindowKind, rect: FloatRect, bounds: FloatViewport): FloatRect {
  return kind === 'canvas' ? clampCanvasRect(rect, bounds) : clampFloatRect(rect, bounds);
}

/**
 * Renumbers the whole map into the allowed band, keeping the current order.
 *
 * This is what makes "bring to front" safe: the raised window is put above the
 * others first, then every window is rewritten as 30, 31, 32… so the total can
 * never drift past the modals. `openIds` caps the live set at eight, so the band
 * is never exhausted in practice.
 */
function renumber(map: WindowMap): WindowMap {
  const ordered = Object.entries(map).sort((a, b) => a[1].z - b[1].z);
  const next: WindowMap = {};
  ordered.forEach(([id, entry], index) => {
    next[id] = { ...entry, z: Math.min(MIN_WINDOW_Z + index, MAX_WINDOW_Z) };
  });
  return next;
}

function topZ(map: WindowMap): number {
  return Object.values(map).reduce((top, entry) => Math.max(top, entry.z), MIN_WINDOW_Z - 1);
}

/** A default canvas window: most of the surface, cascaded so it never hides the last one. */
function canvasRect(bounds: FloatViewport, index: number, at?: { x: number; y: number }): FloatRect {
  const availableWidth = Math.max(MIN_FLOAT_WIDTH, Math.round(bounds.width));
  const availableHeight = Math.max(MIN_FLOAT_HEIGHT, Math.round(bounds.height));
  const width = Math.min(Math.round(availableWidth * 0.62), availableWidth);
  const height = Math.min(Math.round(availableHeight * 0.68), availableHeight);
  const x = at ? at.x : Math.round((availableWidth - width) / 2);
  const y = at ? at.y : Math.round((availableHeight - height) / 2);
  const step = index * 26;
  return clampCanvasRect(
    { x: x + (at ? 0 : step), y: y + (at ? 0 : step), width, height },
    { width: availableWidth, height: availableHeight },
  );
}

export function openWindow(
  map: WindowMap,
  id: string,
  kind: WindowKind,
  space: WindowSpace,
  at?: { x: number; y: number },
): WindowMap {
  if (map[id]) return map;
  const bounds = kindBounds(kind, space);
  const index = Object.values(map).filter(entry => entry.kind === kind).length;
  const rect =
    kind === 'canvas' ? canvasRect(bounds, index, at) : cascadeFloat(defaultFloatRect(bounds), index, bounds);
  return renumber({ ...map, [id]: { kind, rect, z: topZ(map) + 1 } });
}

/**
 * Puts a module on the Workspace surface at a point, framed or not.
 *
 * `openWindow` is a no-op for a module that already has a record, which is right
 * for opening a service and wrong for a drop: dragging something that is
 * currently floating over the app, or parked in the tray, onto the canvas has to
 * move it there and bring it to the front. Dropping a minimized window also
 * restores it, because the drop is the request to see it.
 */
export function placeOnCanvas(
  map: WindowMap,
  id: string,
  space: WindowSpace,
  at?: { x: number; y: number },
): WindowMap {
  if (!map[id]) return openWindow(map, id, 'canvas', space, at);
  const bounds = kindBounds('canvas', space);
  const index = Object.values(map).filter(entry => entry.kind === 'canvas').length;
  return renumber({
    ...map,
    [id]: { kind: 'canvas', rect: canvasRect(bounds, index, at), z: topZ(map) + 1 },
  });
}

/**
 * Turns whatever box a module already has into a float over the app.
 *
 * The two kinds are measured against different surfaces, so a canvas window's
 * rectangle cannot be reused as a viewport one: the record is rebuilt at the
 * cascade position for the new surface. Without this, asking a module that is
 * already open on the Workspace to float does nothing at all, because the
 * record it looks for already exists.
 */
export function floatWindow(map: WindowMap, id: string, space: WindowSpace): WindowMap {
  const entry = map[id];
  if (entry?.kind === 'detached') return raiseWindow(map, id);
  const bounds = kindBounds('detached', space);
  const index = Object.values(map).filter(item => item.kind === 'detached').length;
  const rect = cascadeFloat(defaultFloatRect(bounds), index, bounds);
  return renumber({ ...map, [id]: { kind: 'detached', rect, z: topZ(map) + 1 } });
}

export function closeWindow(map: WindowMap, id: string): WindowMap {
  if (!map[id]) return map;
  const next = { ...map };
  delete next[id];
  return renumber(next);
}

export function raiseWindow(map: WindowMap, id: string): WindowMap {
  const entry = map[id];
  if (!entry) return map;
  const top = topZ(map);
  if (entry.z >= top) return map;
  return renumber({ ...map, [id]: { ...entry, z: top + 1 } });
}

/** A maximized or minimized window has no box to drag, so movement is refused. */
function movable(entry: ServiceWindow | undefined): entry is ServiceWindow {
  return Boolean(entry) && !entry?.restore && !entry?.minimized;
}

export function moveWindow(
  map: WindowMap,
  id: string,
  dx: number,
  dy: number,
  space: WindowSpace,
): WindowMap {
  const entry = map[id];
  if (!movable(entry)) return map;
  const bounds = kindBounds(entry.kind, space);
  const rect =
    entry.kind === 'canvas'
      ? clampCanvasRect({ ...entry.rect, x: entry.rect.x + dx, y: entry.rect.y + dy }, bounds)
      : dragFloat(entry.rect, dx, dy, bounds);
  if (rect.x === entry.rect.x && rect.y === entry.rect.y) return map;
  return { ...map, [id]: { ...entry, rect } };
}

export function resizeWindow(
  map: WindowMap,
  id: string,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  space: WindowSpace,
): WindowMap {
  const entry = map[id];
  if (!movable(entry)) return map;
  const bounds = kindBounds(entry.kind, space);
  const rect =
    entry.kind === 'canvas'
      ? resizeEdges(entry.rect, direction, dx, dy, bounds)
      : resizeFloat(entry.rect, dx, dy, bounds);
  if (
    rect.x === entry.rect.x &&
    rect.y === entry.rect.y &&
    rect.width === entry.rect.width &&
    rect.height === entry.rect.height
  ) {
    return map;
  }
  return { ...map, [id]: { ...entry, rect } };
}

/** Fill the surface; the second call (or the restore button) puts the box back. */
export function toggleMaximize(map: WindowMap, id: string, space: WindowSpace): WindowMap {
  const entry = map[id];
  if (!entry) return map;
  const bounds = kindBounds(entry.kind, space);
  if (entry.restore) {
    return {
      ...map,
      [id]: { ...entry, rect: clampFor(entry.kind, entry.restore, bounds), restore: undefined, minimized: false },
    };
  }
  return {
    ...map,
    [id]: {
      ...entry,
      rect: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      restore: entry.rect,
      minimized: false,
    },
  };
}

/**
 * Minimizing keeps the guest mounted. The window stops being painted and stops
 * taking input, but the page behind it is not torn down, so a chat client keeps
 * its connection exactly as a parked module does.
 */
export function toggleMinimize(map: WindowMap, id: string): WindowMap {
  const entry = map[id];
  if (!entry) return map;
  return { ...map, [id]: { ...entry, minimized: !entry.minimized } };
}

/**
 * Re-fits every window after the surface changed. Returns the same map when
 * nothing moved, so callers can put it straight into a state setter without
 * causing a render loop.
 */
export function clampWindows(map: WindowMap, space: WindowSpace): WindowMap {
  let changed = false;
  const next: WindowMap = {};
  for (const [id, entry] of Object.entries(map)) {
    const bounds = kindBounds(entry.kind, space);
    const rect = clampFor(entry.kind, entry.rect, bounds);
    const restore = entry.restore ? clampFor(entry.kind, entry.restore, bounds) : undefined;
    if (
      rect.x !== entry.rect.x ||
      rect.y !== entry.rect.y ||
      rect.width !== entry.rect.width ||
      rect.height !== entry.rect.height
    ) {
      changed = true;
      next[id] = { ...entry, rect, restore };
    } else {
      next[id] = entry;
    }
  }
  return changed ? next : map;
}

export function windowsOfKind(map: WindowMap, kind: WindowKind): string[] {
  return Object.entries(map)
    .filter(([, entry]) => entry.kind === kind)
    .sort((a, b) => a[1].z - b[1].z)
    .map(([id]) => id);
}

export function minimizedWindows(map: WindowMap, kind: WindowKind): string[] {
  return windowsOfKind(map, kind).filter(id => Boolean(map[id]?.minimized));
}

/** Inline style for a window living on the canvas (canvas-relative pixels). */
export function canvasWindowStyle(rect: FloatRect, z: number): Record<string, string | number> {
  return {
    position: 'absolute',
    inset: 'auto',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: z,
  };
}
