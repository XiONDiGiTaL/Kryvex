import { describe, expect, it } from 'vitest';
import {
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  isHexColor,
  mixHex,
  normalizeHex,
  readableInk,
  relativeLuminance,
  rgbToHex,
  rgbToHsv,
} from '../src/lib/color';

describe('hex parsing', () => {
  it('normalises shorthand and long values', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('38bdf8')).toBe('#38BDF8');
    expect(normalizeHex(' #fff ')).toBe('#FFFFFF');
    expect(normalizeHex('#abcd')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex(42)).toBeNull();
    expect(isHexColor('#123456')).toBe(true);
    expect(isHexColor('#12345')).toBe(false);
  });

  it('round-trips RGB channels', () => {
    expect(hexToRgb('#38BDF8')).toEqual({ r: 56, g: 189, b: 248 });
    expect(rgbToHex(56, 189, 248)).toBe('#38BDF8');
    expect(rgbToHex(300, -20, 12.6)).toBe('#FF000D');
  });
});

describe('colour mixing and contrast', () => {
  it('mixes endpoints and midpoints', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('computes perceived luminance and readable ink', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
    expect(relativeLuminance('#38BDF8')).toBeGreaterThan(0.3);
    expect(readableInk('#FFFFFF')).toBe('#06121B');
    expect(readableInk('#000000')).toBe('#FFFFFF');
  });
});

describe('HSV conversion', () => {
  it('converts primary colours and greys', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv(0, 255, 0)).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv(0, 0, 255)).toEqual({ h: 240, s: 1, v: 1 });
    expect(rgbToHsv(128, 128, 128)).toEqual({ h: 0, s: 0, v: 128 / 255 });
    expect(hsvToRgb(0, 1, 1)).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToHex(120, 1, 1)).toBe('#00FF00');
  });

  it('round-trips arbitrary colours', () => {
    for (const value of ['#FF7A00', '#2DD4BF', '#8B5CF6', '#F0F3F7']) {
      const rgb = hexToRgb(value);
      if (!rgb) throw new Error('bad fixture');
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(value);
    }
  });
});
