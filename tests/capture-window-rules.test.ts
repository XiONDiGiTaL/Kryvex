import { describe, expect, it } from 'vitest';
import {
  PREVIEW_MAX_HEIGHT,
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_HEIGHT,
  PREVIEW_MIN_WIDTH,
  previewBounds,
  previewDimension,
  previewKind,
  previewLanguage,
  previewTarget,
} from '../electron/capture-window-rules';

/**
 * The preview window is built from values the renderer sends, so each one has a
 * decision that must hold: an unknown kind is a still, an unknown language is
 * English, a nonsense dimension is not a window size, and no capture may open a
 * window larger than the desktop it is on.
 */
describe('previewKind', () => {
  it('takes the clip marker and treats everything else as a still', () => {
    expect(previewKind('clip')).toBe('clip');
    expect(previewKind('shot')).toBe('shot');
    expect(previewKind(undefined)).toBe('shot');
    expect(previewKind('video')).toBe('shot');
  });
});

describe('previewLanguage', () => {
  it('accepts the four locales and falls back to English', () => {
    expect(previewLanguage('en')).toBe('en');
    expect(previewLanguage('es')).toBe('es');
    expect(previewLanguage('de')).toBe('de');
    expect(previewLanguage('fr')).toBe('fr');
    expect(previewLanguage('pt')).toBe('en');
    expect(previewLanguage(42)).toBe('en');
  });
});

describe('previewDimension', () => {
  it('reports a whole pixel count or zero', () => {
    expect(previewDimension(1440)).toBe(1440);
    expect(previewDimension('846')).toBe(846);
    expect(previewDimension(1234.6)).toBe(1235);
    expect(previewDimension(0)).toBe(0);
    expect(previewDimension(-10)).toBe(0);
    expect(previewDimension(Number.NaN)).toBe(0);
    expect(previewDimension('wide')).toBe(0);
  });

  it('never hands the window builder a runaway size', () => {
    expect(previewDimension(500_000)).toBe(16_384);
  });
});

describe('previewTarget', () => {
  it('is one clean line and never empty', () => {
    expect(previewTarget('Gmail')).toBe('Gmail');
    expect(previewTarget('  Gmail\n\t inbox  ')).toBe('Gmail inbox');
    expect(previewTarget('')).toBe('Kryvex');
    expect(previewTarget(undefined)).toBe('Kryvex');
    expect(previewTarget('a'.repeat(200))).toHaveLength(80);
  });
});

describe('previewBounds', () => {
  const desktop = { width: 1920, height: 1080 };

  it('keeps a screenshot close to its own shape inside the desktop', () => {
    const bounds = previewBounds(1440, 846, desktop);
    expect(bounds.width).toBeLessThanOrEqual(PREVIEW_MAX_WIDTH);
    expect(bounds.height).toBeLessThanOrEqual(PREVIEW_MAX_HEIGHT);
    // 1440×846 is 1.70:1; the window adds only the toolbar and footer height.
    expect(bounds.width / (bounds.height - 132)).toBeCloseTo(1.7, 1);
  });

  it('does not open a window larger than the screen it is on', () => {
    const bounds = previewBounds(3840, 2160, desktop);
    expect(bounds.width).toBeLessThanOrEqual(PREVIEW_MAX_WIDTH);
    expect(bounds.height).toBeLessThanOrEqual(PREVIEW_MAX_HEIGHT);
  });

  it('gives a small capture a usable frame instead of a sliver', () => {
    const bounds = previewBounds(320, 200, desktop);
    expect(bounds.width).toBeGreaterThanOrEqual(PREVIEW_MIN_WIDTH);
    expect(bounds.height).toBeGreaterThanOrEqual(PREVIEW_MIN_HEIGHT);
  });

  it('gives a recording, which has no frame size, a watching-sized window', () => {
    expect(previewBounds(0, 0, desktop)).toEqual({ width: 980, height: 660 });
  });

  it('still fits when the desktop itself is small', () => {
    const bounds = previewBounds(1920, 1080, { width: 500, height: 400 });
    expect(bounds.width).toBeLessThanOrEqual(420);
    expect(bounds.height).toBeLessThanOrEqual(328);
    expect(bounds.width).toBeGreaterThanOrEqual(PREVIEW_MIN_WIDTH);
    expect(bounds.height).toBeGreaterThanOrEqual(PREVIEW_MIN_HEIGHT);
  });
});
