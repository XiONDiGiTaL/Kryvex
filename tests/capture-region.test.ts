import { describe, expect, it } from 'vitest';
import {
  clampRegion,
  cropBox,
  even,
  fitSize,
  MIN_REGION_PX,
  pickerArena,
  regionFromDrag,
  regionLabel,
  regionRect,
} from '../src/lib/capture-region';

const SOURCE = { width: 1920, height: 1080 };

describe('fitSize', () => {
  it('shrinks a wide frame to the space it has', () => {
    expect(fitSize(SOURCE, { width: 960, height: 800 })).toEqual({ width: 960, height: 540 });
  });

  it('keeps the aspect ratio when the height is the tighter side', () => {
    expect(fitSize(SOURCE, { width: 4000, height: 270 })).toEqual({ width: 480, height: 270 });
  });

  it('never enlarges a small frame past 1:1', () => {
    expect(fitSize({ width: 320, height: 180 }, { width: 1200, height: 800 })).toEqual({
      width: 320,
      height: 180,
    });
  });

  it('answers with nothing to draw for an empty frame or an empty space', () => {
    expect(fitSize({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual({
      width: 0,
      height: 0,
    });
    expect(fitSize(SOURCE, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe('pickerArena', () => {
  it('leaves the bar and the margins out of the space it may draw in', () => {
    expect(pickerArena({ width: 1448, height: 968 })).toEqual({ width: 1400, height: 800 });
  });

  it('never asks for a negative box in a tiny window', () => {
    expect(pickerArena({ width: 40, height: 60 })).toEqual({ width: 1, height: 1 });
  });
});

describe('regionFromDrag', () => {
  const frame = { width: 960, height: 540 };

  it('reads a drag back at the frame’s own scale', () => {
    // Half the displayed frame, so half the source: 960×540 at the origin.
    expect(regionFromDrag({ x: 0, y: 0 }, { x: 480, y: 270 }, frame, SOURCE)).toEqual({
      x: 0,
      y: 0,
      width: 960,
      height: 540,
    });
  });

  it('accepts a drag made in any direction', () => {
    const down = regionFromDrag({ x: 200, y: 100 }, { x: 600, y: 400 }, frame, SOURCE);
    const up = regionFromDrag({ x: 600, y: 400 }, { x: 200, y: 100 }, frame, SOURCE);
    expect(up).toEqual(down);
    expect(down).toEqual({ x: 400, y: 200, width: 800, height: 600 });
  });

  it('holds a drag that leaves the frame at its edge', () => {
    expect(regionFromDrag({ x: 900, y: 500 }, { x: 5000, y: 5000 }, frame, SOURCE)).toEqual({
      x: 1800,
      y: 1000,
      width: 120,
      height: 80,
    });
  });

  it('refuses a click, a sliver and a frame with no size', () => {
    expect(regionFromDrag({ x: 100, y: 100 }, { x: 102, y: 140 }, frame, SOURCE)).toBeNull();
    expect(regionFromDrag({ x: 100, y: 100 }, { x: 300, y: 104 }, frame, SOURCE)).toBeNull();
    expect(regionFromDrag({ x: 0, y: 0 }, { x: 500, y: 300 }, { width: 0, height: 0 }, SOURCE)).toBeNull();
    expect(regionFromDrag({ x: 0, y: 0 }, { x: 500, y: 300 }, frame, { width: 0, height: 0 })).toBeNull();
  });

  it('measures the minimum in source pixels, not in screen pixels', () => {
    // A quarter-scale picker: 6 screen pixels is 24 source pixels, which just passes.
    const quarter = { width: 480, height: 270 };
    expect(regionFromDrag({ x: 0, y: 0 }, { x: 6, y: 6 }, quarter, SOURCE)).toEqual({
      x: 0,
      y: 0,
      width: 24,
      height: 24,
    });
    expect(regionFromDrag({ x: 0, y: 0 }, { x: 5, y: 5 }, quarter, SOURCE)).toBeNull();
  });

  it('keeps a region inside the frame after rounding', () => {
    // A drag of under one source pixel is not a selection.
    expect(
      regionFromDrag({ x: 959.4, y: 539.4 }, { x: 960, y: 540 }, { width: 960, height: 540 }, SOURCE),
    ).toBeNull();
    const edge = regionFromDrag({ x: 940, y: 520 }, { x: 960, y: 540 }, frame, SOURCE);
    expect(edge).toEqual({ x: 1880, y: 1040, width: 40, height: 40 });
    expect(edge!.x + edge!.width).toBeLessThanOrEqual(SOURCE.width);
    expect(edge!.y + edge!.height).toBeLessThanOrEqual(SOURCE.height);
  });
});

describe('clampRegion', () => {
  it('moves an anchor back inside and shrinks the span to match', () => {
    expect(clampRegion({ x: 1880, y: 1000, width: 400, height: 400 }, SOURCE)).toEqual({
      x: 1880,
      y: 1000,
      width: 40,
      height: 80,
    });
    expect(clampRegion({ x: -50, y: -50, width: 200, height: 200 }, SOURCE)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });
  });

  it('drops a region that is too small or has no frame to sit in', () => {
    expect(clampRegion({ x: 10, y: 10, width: MIN_REGION_PX - 1, height: 100 }, SOURCE)).toBeNull();
    expect(clampRegion({ x: 10, y: 10, width: 100, height: 100 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('cropBox', () => {
  it('asks for the region itself when it fits, and says so', () => {
    expect(cropBox({ x: 100, y: 50, width: 640, height: 480 }, SOURCE)).toEqual({
      sx: 100,
      sy: 50,
      sw: 640,
      sh: 480,
      exact: true,
    });
    // A region of exactly the frame is still the region that was asked for.
    expect(cropBox({ x: 0, y: 0, width: 1920, height: 1080 }, SOURCE)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1920,
      sh: 1080,
      exact: true,
    });
  });

  it('falls back to the whole frame, marked untrue, for a region that cannot be honoured', () => {
    const whole = { sx: 0, sy: 0, sw: 1920, sh: 1080, exact: false };
    // No region at all is the whole frame, and nothing was refused.
    expect(cropBox(null, SOURCE)).toEqual({ ...whole, exact: true });
    // Saved while the window was larger: it no longer fits and is not trimmed.
    expect(cropBox({ x: 1800, y: 1000, width: 800, height: 600 }, SOURCE)).toEqual(whole);
    expect(cropBox({ x: 1900, y: 1000, width: 400, height: 400 }, SOURCE)).toEqual(whole);
    expect(cropBox({ x: 0, y: 0, width: 4, height: 4 }, SOURCE)).toEqual(whole);
    expect(cropBox({ x: -20, y: 0, width: 400, height: 400 }, SOURCE)).toEqual(whole);
    expect(cropBox({ x: 0, y: 0, width: 400, height: 400 }, { width: 0, height: 0 })).toEqual({
      sx: 0,
      sy: 0,
      sw: 1,
      sh: 1,
      exact: false,
    });
  });
});

describe('even', () => {
  it('rounds a span down to something an encoder accepts', () => {
    expect(even(641)).toBe(640);
    expect(even(640)).toBe(640);
    expect(even(1)).toBe(2);
    expect(even(0)).toBe(2);
    expect(even(Number.NaN)).toBe(2);
  });
});

describe('regionLabel', () => {
  it('reads as a size', () => {
    expect(regionLabel({ x: 0, y: 0, width: 800, height: 600 })).toBe('800 × 600');
    expect(regionLabel({ x: 0, y: 0, width: 801.4, height: 600.6 })).toBe('801 × 601');
  });
});

describe('regionRect', () => {
  it('maps a region back onto the scaled frame', () => {
    expect(regionRect({ x: 960, y: 270, width: 480, height: 270 }, { width: 960, height: 540 }, SOURCE)).toEqual({
      left: 480,
      top: 135,
      width: 240,
      height: 135,
    });
  });

  it('draws nothing when either size is missing', () => {
    expect(regionRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }, SOURCE)).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
    expect(regionRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 10, height: 10 }, { width: 0, height: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
  });
});
