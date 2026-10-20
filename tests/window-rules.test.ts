import { describe, expect, it } from 'vitest';
import {
  MIN_WINDOW_SIZE,
  PREFERRED_WINDOW_SIZE,
  fitWindowToWorkArea,
} from '../electron/window-rules';

describe('fitWindowToWorkArea', () => {
  it('keeps the design size on a display that fits it', () => {
    expect(fitWindowToWorkArea({ width: 2560, height: 1440 })).toEqual({
      width: 1440,
      height: 900,
    });
    expect(fitWindowToWorkArea({ width: 1920, height: 1080 })).toEqual({
      width: 1440,
      height: 900,
    });
  });

  it('shrinks to a laptop work area with a margin', () => {
    expect(fitWindowToWorkArea({ width: 1366, height: 728 })).toEqual({
      width: 1334,
      height: 696,
    });
    expect(fitWindowToWorkArea({ width: 1280, height: 720 })).toEqual({
      width: 1248,
      height: 688,
    });
  });

  it('never asks for less than the verified floor', () => {
    const tiny = fitWindowToWorkArea({ width: 640, height: 400 });
    expect(tiny).toEqual(MIN_WINDOW_SIZE);
    expect(tiny.width).toBeGreaterThanOrEqual(900);
    expect(tiny.height).toBeGreaterThanOrEqual(520);
  });

  it('treats a 150%-scaled 1366-wide screen as the small screen it is', () => {
    // 1366×768 at 150% leaves roughly 910×480 device-independent pixels.
    const size = fitWindowToWorkArea({ width: 910, height: 480 });
    expect(size.width).toBe(900);
    expect(size.height).toBe(520);
  });

  it('lets the caller override the preferred size and margin', () => {
    expect(
      fitWindowToWorkArea({ width: 1600, height: 1000 }, { width: 1200, height: 800 }, 0),
    ).toEqual({ width: 1200, height: 800 });
    expect(PREFERRED_WINDOW_SIZE).toEqual({ width: 1440, height: 900 });
  });
});
