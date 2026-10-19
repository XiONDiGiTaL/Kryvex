import { describe, expect, it } from 'vitest';
import { DEFAULT_ZOOM, ZOOM_STEPS, canZoom, stepZoom } from '../src/lib/zoom';

describe('stepZoom', () => {
  it('starts at 100 percent', () => {
    expect(DEFAULT_ZOOM).toBe(1);
    expect(ZOOM_STEPS).toContain(1);
  });

  it('moves one step in each direction', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
  });

  it('clamps at the ends of the scale', () => {
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });

  it('snaps an off-step factor to the closest step before moving', () => {
    expect(stepZoom(1.03, 1)).toBe(1.1);
    expect(stepZoom(1.03, -1)).toBe(0.9);
    expect(stepZoom(0.01, 1)).toBe(0.67);
    expect(stepZoom(Number.NaN, 1)).toBe(1.1);
  });
});

describe('canZoom', () => {
  it('reports whether a further step is possible', () => {
    expect(canZoom(1, 1)).toBe(true);
    expect(canZoom(2, 1)).toBe(false);
    expect(canZoom(1, -1)).toBe(true);
    expect(canZoom(0.5, -1)).toBe(false);
  });
});
