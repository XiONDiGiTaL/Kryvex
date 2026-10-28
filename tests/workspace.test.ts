import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE } from '../src/lib/defaults';
import { sanitizeWorkspace } from '../src/lib/store';
import {
  MAX_WINDOW_Z,
  MIN_FLOAT_HEIGHT,
  MIN_FLOAT_WIDTH,
  MIN_WINDOW_Z,
  clampCanvasRect,
  resizeEdges,
} from '../src/lib/floating';
import {
  type WindowMap,
  type WindowSpace,
  clampWindows,
  closeWindow,
  floatWindow,
  minimizedWindows,
  moveWindow,
  openWindow,
  placeOnCanvas,
  raiseWindow,
  resizeWindow,
  toggleMaximize,
  toggleMinimize,
  windowsOfKind,
} from '../src/lib/workspace';

const viewport = { width: 1440, height: 900 };
const canvas = { width: 1000, height: 700 };
const space: WindowSpace = { viewport, canvas };

function opened(ids: string[]): WindowMap {
  return ids.reduce((map, id) => openWindow(map, id, 'canvas', space), {} as WindowMap);
}

describe('workspace canvas geometry', () => {
  it('contains a window inside the canvas instead of letting it hang over', () => {
    const rect = clampCanvasRect({ x: -500, y: -400, width: 4000, height: 3000 }, canvas);
    expect(rect).toEqual({ x: 0, y: 0, width: canvas.width, height: canvas.height });
  });

  it('keeps a minimum size when the canvas is generous', () => {
    const rect = clampCanvasRect({ x: 10, y: 10, width: 20, height: 20 }, canvas);
    expect(rect.width).toBe(MIN_FLOAT_WIDTH);
    expect(rect.height).toBe(MIN_FLOAT_HEIGHT);
  });

  it('moves the dragged edge and leaves the opposite one where it was', () => {
    const base = { x: 200, y: 100, width: 600, height: 400 };
    const west = resizeEdges(base, 'w', 100, 0, canvas);
    expect(west.x).toBe(300);
    expect(west.x + west.width).toBe(base.x + base.width);
    const north = resizeEdges(base, 'n', 0, 50, canvas);
    expect(north.y).toBe(150);
    expect(north.y + north.height).toBe(base.y + base.height);
  });

  it('clamps an edge drag against the canvas and the minimum size', () => {
    const base = { x: 100, y: 100, width: 600, height: 400 };
    const beyond = resizeEdges(base, 'se', 5000, 5000, canvas);
    expect(beyond.width).toBe(canvas.width - base.x);
    expect(beyond.height).toBe(canvas.height - base.y);
    const collapsed = resizeEdges(base, 'se', -5000, -5000, canvas);
    expect(collapsed.width).toBe(MIN_FLOAT_WIDTH);
    expect(collapsed.height).toBe(MIN_FLOAT_HEIGHT);
    const northWest = resizeEdges(base, 'nw', -5000, -5000, canvas);
    expect(northWest.x).toBe(0);
    expect(northWest.y).toBe(0);
  });
});

describe('workspace windows', () => {
  it('opens a canvas window inside the surface', () => {
    const map = opened(['a']);
    const entry = map.a;
    expect(entry?.kind).toBe('canvas');
    expect(entry?.rect.x).toBeGreaterThanOrEqual(0);
    expect(entry?.rect.y).toBeGreaterThanOrEqual(0);
    expect((entry?.rect.x ?? 0) + (entry?.rect.width ?? 0)).toBeLessThanOrEqual(canvas.width);
    expect((entry?.rect.y ?? 0) + (entry?.rect.height ?? 0)).toBeLessThanOrEqual(canvas.height);
  });

  it('places a dropped window at the drop point', () => {
    const map = openWindow({}, 'a', 'canvas', space, { x: 40, y: 60 });
    expect(map.a?.rect.x).toBe(40);
    expect(map.a?.rect.y).toBe(60);
  });

  it('never lets a window climb into the modal layer', () => {
    let map = opened(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    for (let round = 0; round < 20; round += 1) {
      for (const id of ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']) {
        map = raiseWindow(map, id);
        for (const entry of Object.values(map)) {
          expect(entry.z).toBeGreaterThanOrEqual(MIN_WINDOW_Z);
          expect(entry.z).toBeLessThanOrEqual(MAX_WINDOW_Z);
        }
      }
    }
    // Raising is still a real raise: the last window asked for is on top.
    const top = Math.max(...Object.values(map).map(entry => entry.z));
    expect(map.a?.z).toBe(top);
  });

  it('puts a clicked window above the others', () => {
    const map = opened(['a', 'b', 'c']);
    const raised = raiseWindow(map, 'a');
    expect(raised.a?.z).toBeGreaterThan(raised.b?.z ?? 0);
    expect(raised.a?.z).toBeGreaterThan(raised.c?.z ?? 0);
  });

  it('drags and resizes inside the canvas', () => {
    const map = opened(['a']);
    const dragged = moveWindow(map, 'a', 5000, 5000, space);
    expect(dragged.a?.rect.x).toBe(canvas.width - (dragged.a?.rect.width ?? 0));
    expect(dragged.a?.rect.y).toBe(canvas.height - (dragged.a?.rect.height ?? 0));
    const resized = resizeWindow(dragged, 'a', 'se', 5000, 5000, space);
    expect((resized.a?.rect.x ?? 0) + (resized.a?.rect.width ?? 0)).toBe(canvas.width);
  });

  it('maximizes to the canvas and restores the previous box', () => {
    const map = opened(['a']);
    const before = map.a?.rect;
    const maximized = toggleMaximize(map, 'a', space);
    expect(maximized.a?.rect).toEqual({ x: 0, y: 0, width: canvas.width, height: canvas.height });
    const restored = toggleMaximize(maximized, 'a', space);
    expect(restored.a?.rect).toEqual(before);
    expect(restored.a?.restore).toBeUndefined();
  });

  it('refuses to drag or resize a maximized window', () => {
    const maximized = toggleMaximize(opened(['a']), 'a', space);
    expect(moveWindow(maximized, 'a', 40, 40, space)).toBe(maximized);
    expect(resizeWindow(maximized, 'a', 'se', 40, 40, space)).toBe(maximized);
  });

  it('minimizes without losing the box, and lists it for the tray', () => {
    const map = opened(['a', 'b']);
    const minimized = toggleMinimize(map, 'b');
    expect(minimized.b?.minimized).toBe(true);
    expect(minimized.b?.rect).toEqual(map.b?.rect);
    expect(minimizedWindows(minimized, 'canvas')).toEqual(['b']);
    expect(toggleMinimize(minimized, 'b').b?.minimized).toBe(false);
  });

  it('closes a window and renumbers the rest', () => {
    const map = opened(['a', 'b', 'c']);
    const closed = closeWindow(map, 'b');
    expect(closed.b).toBeUndefined();
    expect(windowsOfKind(closed, 'canvas').sort()).toEqual(['a', 'c']);
    expect(closed.a?.z).toBe(MIN_WINDOW_Z);
  });

  it('re-fits every window when the canvas shrinks, and is stable when it does not', () => {
    const map = opened(['a', 'b']);
    expect(clampWindows(map, space)).toBe(map);
    const smaller: WindowSpace = { viewport, canvas: { width: 500, height: 420 } };
    const fitted = clampWindows(map, smaller);
    for (const entry of Object.values(fitted)) {
      expect(entry.rect.width).toBeLessThanOrEqual(500);
      expect(entry.rect.height).toBeLessThanOrEqual(420);
    }
  });

  it('keeps a detached float reachable by its title bar rather than contained', () => {
    const map = openWindow({}, 'a', 'detached', space);
    const dragged = moveWindow(map, 'a', -5000, 0, space);
    expect(dragged.a?.rect.x).toBeLessThan(0);
  });

  it('re-frames a module that is already a canvas window when it floats', () => {
    const map = opened(['a', 'b']);
    const floated = floatWindow(map, 'a', space);
    expect(floated.a?.kind).toBe('detached');
    expect(windowsOfKind(floated, 'detached')).toEqual(['a']);
    expect(windowsOfKind(floated, 'canvas')).toEqual(['b']);
    // It belongs to the app now, so it is no longer contained by the canvas.
    const dragged = moveWindow(floated, 'a', -5000, -5000, space);
    expect(dragged.a?.rect.x).toBeLessThan(0);
    expect(windowsOfKind(dragged, 'detached')).toEqual(['a']);
  });

  it('moves a floating module onto the canvas where it was dropped', () => {
    const floated = floatWindow(opened(['a']), 'a', space);
    const placed = placeOnCanvas(floated, 'a', space, { x: 30, y: 40 });
    expect(placed.a?.kind).toBe('canvas');
    expect(placed.a?.rect.x).toBe(30);
    expect(placed.a?.rect.y).toBe(40);
    expect(windowsOfKind(placed, 'detached')).toEqual([]);
    // Contained by the canvas again, not merely reachable.
    const dragged = moveWindow(placed, 'a', -5000, -5000, space);
    expect(dragged.a?.rect.x).toBe(0);
    expect(dragged.a?.rect.y).toBe(0);
  });

  it('restores a minimized window that is dropped on the canvas', () => {
    const parked = toggleMinimize(opened(['a', 'b']), 'a');
    expect(minimizedWindows(parked, 'canvas')).toEqual(['a']);
    const placed = placeOnCanvas(parked, 'a', space, { x: 10, y: 10 });
    expect(Boolean(placed.a?.minimized)).toBe(false);
    expect(minimizedWindows(placed, 'canvas')).toEqual([]);
    expect(placed.a?.z).toBeGreaterThan(placed.b?.z ?? 0);
  });

  it('opens a module that has no window yet, and leaves an opened one alone', () => {
    const fresh = placeOnCanvas({}, 'a', space, { x: 5, y: 6 });
    expect(fresh.a?.kind).toBe('canvas');
    expect(fresh.a?.rect.x).toBe(5);
    // Placing again keeps one window, moving it rather than stacking a second.
    const again = placeOnCanvas(fresh, 'a', space, { x: 200, y: 100 });
    expect(windowsOfKind(again, 'canvas')).toEqual(['a']);
    expect(again.a?.rect.x).toBe(200);
  });

  it('raises a float that is already floating instead of stacking a second one', () => {
    const first = floatWindow({}, 'a', space);
    const second = floatWindow(floatWindow(first, 'b', space), 'a', space);
    expect(windowsOfKind(second, 'detached').sort()).toEqual(['a', 'b']);
    expect(second.a?.z).toBeGreaterThan(second.b?.z ?? 0);
  });
});

describe('carrying a window between the canvas and the app', () => {
  // The canvas is drawn to the right of the sidebar and below the header, so its
  // box is offset as well as sized; both are needed to translate a drag.
  const placed: WindowSpace = { viewport, canvas, canvasBox: { left: 180, top: 80 } };

  it('parks a float that is dragged onto the board', () => {
    const floated = floatWindow({}, 'view:rooms', placed);
    expect(floated['view:rooms']?.kind).toBe('detached');
    const rect = floated['view:rooms']!.rect;
    // Aim the title bar at the middle of the canvas and step there.
    const grabX = rect.x + Math.min(140, Math.max(30, rect.width / 2));
    const grabY = rect.y + 12;
    const goal = { x: 180 + canvas.width / 2, y: 80 + canvas.height / 2 };
    const parked = moveWindow(
      floated,
      'view:rooms',
      goal.x - grabX,
      goal.y - grabY,
      placed,
    );
    expect(parked['view:rooms']?.kind).toBe('canvas');
    const box = parked['view:rooms']!.rect;
    // Contained by the canvas, and roughly where the drag was released.
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.width);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.height);
    // The same box, in the canvas's own pixels: the drag is not a jump to a
    // default slot, it stays where the title bar was released (or against the
    // edge the clamp allows, for a window wider than the space left of it).
    expect(box.width).toBe(rect.width);
    expect(box.y).toBe(Math.max(0, Math.min(rect.y + goal.y - grabY - 80, canvas.height - box.height)));
  });

  it('hands a canvas window back to the viewport when it is pushed off', () => {
    const start = placeOnCanvas({}, 'view:rooms', placed, { x: 100, y: 100 });
    expect(start['view:rooms']?.kind).toBe('canvas');
    // A nudge stays on the board; the margin is what makes the gesture deliberate.
    expect(moveWindow(start, 'view:rooms', 4, 4, placed)['view:rooms']?.kind).toBe('canvas');
    const released = moveWindow(start, 'view:rooms', -400, 0, placed);
    expect(released['view:rooms']?.kind).toBe('detached');
    const box = released['view:rooms']!.rect;
    // Remembered in viewport pixels now, not canvas ones.
    expect(box.x).toBeLessThan(180);
    expect(box.y).toBeGreaterThan(100);
  });

  it('never leaves a surface the window was not dragged towards', () => {
    const floated = floatWindow({}, 'a', { viewport, canvas: null });
    // No canvas on screen means no boundary to cross: the float only moves.
    const moved = moveWindow(floated, 'a', -20, 0, { viewport, canvas: null });
    expect(moved.a?.kind).toBe('detached');
    expect(moved.a?.rect.x).toBe(floated.a!.rect.x - 20);
  });
});

describe('window motion settings', () => {
  it('defaults to the subtle motion a fresh profile starts with', () => {
    expect(DEFAULT_WORKSPACE).toEqual({ motion: 'subtle', motionSpeed: 1 });
    expect(sanitizeWorkspace(undefined)).toEqual(DEFAULT_WORKSPACE);
    expect(sanitizeWorkspace({})).toEqual(DEFAULT_WORKSPACE);
  });

  it('keeps the three motions and refuses anything else', () => {
    for (const motion of ['none', 'subtle', 'bouncy'] as const) {
      expect(sanitizeWorkspace({ motion, motionSpeed: 1 }).motion).toBe(motion);
    }
    expect(sanitizeWorkspace({ motion: 'spin' }).motion).toBe('subtle');
    expect(sanitizeWorkspace({ motion: 7 }).motion).toBe('subtle');
  });

  it('clamps the speed to the range the keyframes were designed for', () => {
    expect(sanitizeWorkspace({ motionSpeed: 4 }).motionSpeed).toBe(2);
    expect(sanitizeWorkspace({ motionSpeed: 0.05 }).motionSpeed).toBe(0.5);
    // Half steps only: a slider-free picker offers 0.5, 1, 1.5 and 2.
    expect(sanitizeWorkspace({ motionSpeed: 1.26 }).motionSpeed).toBe(1.5);
    expect(sanitizeWorkspace({ motionSpeed: 'fast' }).motionSpeed).toBe(1);
  });
});
