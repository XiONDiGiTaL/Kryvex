import { describe, expect, it } from 'vitest';
import {
  MIN_FLOAT_HEIGHT,
  MIN_FLOAT_WIDTH,
  MIN_VISIBLE_X,
  MIN_VISIBLE_Y,
  cascadeFloat,
  clampFloatRect,
  defaultFloatRect,
  dragFloat,
  floatWindowStyle,
  resizeFloat,
} from '../src/lib/floating';

const viewport = { width: 1440, height: 900 };

describe('floating service windows', () => {
  it('opens a window that fits inside the viewport', () => {
    const rect = defaultFloatRect(viewport);
    expect(rect.width).toBeGreaterThanOrEqual(MIN_FLOAT_WIDTH);
    expect(rect.height).toBeGreaterThanOrEqual(MIN_FLOAT_HEIGHT);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
    expect(rect.x).toBeGreaterThan(0);
  });

  it('keeps a small viewport usable instead of overflowing it', () => {
    const rect = defaultFloatRect({ width: 500, height: 400 });
    expect(rect.width).toBeLessThanOrEqual(500);
    expect(rect.height).toBeLessThanOrEqual(400);
    expect(rect.x).toBeGreaterThanOrEqual(MIN_VISIBLE_X - rect.width);
    expect(rect.y).toBeGreaterThanOrEqual(0);
  });

  it('never lets a window be dragged where it cannot be grabbed back', () => {
    const base = defaultFloatRect(viewport);
    const farRight = clampFloatRect({ ...base, x: 99_999 }, viewport);
    expect(farRight.x).toBe(viewport.width - MIN_VISIBLE_X);
    const farLeft = clampFloatRect({ ...base, x: -99_999 }, viewport);
    expect(farLeft.x).toBe(MIN_VISIBLE_X - base.width);
    const farDown = clampFloatRect({ ...base, y: 99_999 }, viewport);
    expect(farDown.y).toBe(viewport.height - MIN_VISIBLE_Y);
    expect(clampFloatRect({ ...base, y: -50 }, viewport).y).toBe(0);
  });

  it('refuses a window smaller than the minimum', () => {
    const rect = clampFloatRect({ x: 10, y: 10, width: 20, height: 10 }, viewport);
    expect(rect.width).toBe(MIN_FLOAT_WIDTH);
    expect(rect.height).toBe(MIN_FLOAT_HEIGHT);
  });

  it('applies drag and resize deltas through the same clamp', () => {
    const base = { x: 100, y: 100, width: 600, height: 500 };
    expect(dragFloat(base, 40, -20, viewport)).toMatchObject({ x: 140, y: 80 });
    expect(resizeFloat(base, 100, 60, viewport)).toMatchObject({ width: 700, height: 560 });
    expect(resizeFloat(base, -5000, -5000, viewport)).toMatchObject({
      width: MIN_FLOAT_WIDTH,
      height: MIN_FLOAT_HEIGHT,
    });
  });

  it('cascades a second window so the first stays readable', () => {
    const base = defaultFloatRect(viewport);
    const next = cascadeFloat(base, 1, viewport);
    expect(next.x).toBeLessThan(base.x);
    expect(next.y).toBeLessThan(base.y);
    expect(cascadeFloat(base, 0, viewport)).toEqual(base);
  });

  it('turns a rectangle into inline style values', () => {
    expect(floatWindowStyle({ x: 12, y: 34, width: 560, height: 400 }, 44)).toEqual({
      left: '12px',
      top: '34px',
      width: '560px',
      height: '400px',
      zIndex: 44,
    });
  });
});
