import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearWallpaper,
  decodeImageDataUrl,
  readWallpaper,
  writeWallpaper,
} from '../electron/wallpaper';
import { sanitizeWallpaper, sanitizeState } from '../src/lib/store';
import { sanitizeWallpaperImage } from '../src/lib/wallpaper';

// A 1×1 PNG, enough to exercise signature checks without a fixture file.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wD/1sP0vQAAAABJRU5ErkJggg==';

const roots: string[] = [];

function tempUserData(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-wallpaper-'));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('decodeImageDataUrl', () => {
  it('accepts raster data URLs whose bytes match the declared type', () => {
    const decoded = decodeImageDataUrl(PNG);
    expect(decoded?.ext).toBe('png');
    expect(decoded?.mime).toBe('image/png');
    expect(decoded?.bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('rejects SVG, remote URLs, mismatched bytes and junk', () => {
    expect(decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    expect(decodeImageDataUrl('https://example.com/a.png')).toBeNull();
    expect(decodeImageDataUrl('data:image/jpeg;base64,iVBORw0KGgo=')).toBeNull();
    expect(decodeImageDataUrl(`data:image/png;base64,${'A'.repeat(40)}`)).toBeNull();
    expect(decodeImageDataUrl(42)).toBeNull();
  });
});

describe('wallpaper files', () => {
  it('round-trips one image and replaces the previous one', () => {
    const userData = tempUserData();
    expect(readWallpaper(userData)).toBeNull();

    const written = writeWallpaper(userData, PNG);
    expect(written?.bytes).toBeGreaterThan(0);

    const loaded = readWallpaper(userData);
    expect(loaded?.dataUrl).toBe(PNG);

    expect(writeWallpaper(userData, PNG)).not.toBeNull();
    const files = fs.readdirSync(path.join(userData, 'wallpaper'));
    expect(files).toEqual(['wallpaper.png']);
    expect(readWallpaper(userData)?.dataUrl).toBe(PNG);
  });

  it('refuses invalid payloads without touching the stored image', () => {
    const userData = tempUserData();
    writeWallpaper(userData, PNG);
    expect(writeWallpaper(userData, 'data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    expect(readWallpaper(userData)?.dataUrl).toBe(PNG);
  });

  it('clears the folder but keeps it usable', () => {
    const userData = tempUserData();
    writeWallpaper(userData, PNG);
    expect(clearWallpaper(userData)).toBe(true);
    expect(readWallpaper(userData)).toBeNull();
    expect(clearWallpaper(userData)).toBe(true);
  });
});

describe('wallpaper settings', () => {
  it('is disabled and theme-only by default', () => {
    expect(sanitizeWallpaper(null)).toEqual({
      enabled: false,
      source: 'gradient',
      fit: 'cover',
      veil: 55,
    });
  });

  it('clamps the veil and validates the fill mode', () => {
    expect(sanitizeWallpaper({ fit: 'tile', veil: 140 })).toEqual({
      enabled: false,
      source: 'gradient',
      fit: 'tile',
      veil: 90,
    });
    expect(sanitizeWallpaper({ fit: 'stretch', veil: -4 })).toEqual({
      enabled: false,
      source: 'gradient',
      fit: 'cover',
      veil: 0,
    });
    expect(sanitizeWallpaper({ fit: 'contain', veil: 33.6 })).toEqual({
      enabled: false,
      source: 'gradient',
      fit: 'contain',
      veil: 34,
    });
    expect(sanitizeWallpaper({ veil: 'lots' })).toEqual({
      enabled: false,
      source: 'gradient',
      fit: 'cover',
      veil: 55,
    });
  });

  it('keeps an explicit opt-in and rejects junk switches', () => {
    expect(
      sanitizeWallpaper({ enabled: true, source: 'image', fit: 'contain', veil: 20 }),
    ).toEqual({ enabled: true, source: 'image', fit: 'contain', veil: 20 });
    expect(sanitizeWallpaper({ enabled: 'yes', source: 'video' })).toEqual({
      enabled: false,
      source: 'gradient',
      fit: 'cover',
      veil: 55,
    });
  });

  it('defaults older saved state to the theme alone', () => {
    const state = sanitizeState({ settings: { themeId: 'kryvex-dark' } });
    expect(state.settings.wallpaper).toEqual({
      enabled: false,
      source: 'gradient',
      fit: 'cover',
      veil: 55,
    });
  });

  it('accepts only validated data URLs in the renderer', () => {
    expect(sanitizeWallpaperImage({ dataUrl: PNG, bytes: 12 })).toMatchObject({
      dataUrl: PNG,
      bytes: 12,
    });
    expect(sanitizeWallpaperImage({ dataUrl: 'javascript:alert(1)' })).toBeNull();
    expect(sanitizeWallpaperImage({ dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })).toBeNull();
  });
});
