import type { WallpaperImage } from '../types';

/**
 * Wallpapers are user images, so they never travel inside the saved state:
 * the desktop shell writes one file beside the state file and the web preview
 * keeps a single downscaled data URL in localStorage. Only the opt-in switch,
 * the chosen source (theme wash or image), the fit and the veil live in state.
 */
const KEY = 'kryvex.wallpaper.v1';
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_STORED_BYTES = 6 * 1024 * 1024;
const MAX_EDGE = 2560;
const DATA_URL = /^data:image\/(png|jpeg|webp|avif|gif);base64,[a-z0-9+/=]+$/i;

export const WALLPAPER_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

export interface WallpaperResult {
  ok: boolean;
  message: string;
  image: WallpaperImage | null;
}

function bridge() {
  return typeof window !== 'undefined' ? window.kryvex : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Never trust stored bytes: validate the data URL before painting the shell. */
export function sanitizeWallpaperImage(raw: unknown): WallpaperImage | null {
  if (!isRecord(raw)) return null;
  const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl : '';
  if (dataUrl.length > MAX_STORED_BYTES || !DATA_URL.test(dataUrl)) return null;
  const bytes = Number(raw.bytes);
  return {
    dataUrl,
    bytes: Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : Math.round(dataUrl.length * 0.75),
    addedAt: Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : Date.now(),
  };
}

export async function loadWallpaper(): Promise<WallpaperImage | null> {
  const kx = bridge();
  if (kx) {
    try {
      return sanitizeWallpaperImage(await kx.wallpaperLoad());
    } catch {
      return null;
    }
  }
  try {
    return sanitizeWallpaperImage(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return null;
  }
}

/**
 * Re-encodes the image to a bounded WebP so a 40 MP photo does not sit in
 * localStorage or the state folder at full size. Animated GIFs flatten.
 */
async function encode(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.9);
}

export async function importWallpaper(file: File): Promise<WallpaperResult> {
  const fail = (message: string): WallpaperResult => ({ ok: false, message, image: null });
  if (!file.type.startsWith('image/')) return fail('That file is not an image.');
  if (file.size > MAX_SOURCE_BYTES) return fail('Pick an image smaller than 20 MB.');

  let dataUrl: string;
  try {
    dataUrl = await encode(file);
  } catch {
    return fail('The image could not be read.');
  }

  const image = sanitizeWallpaperImage({
    dataUrl,
    bytes: Math.round(dataUrl.length * 0.75),
    addedAt: Date.now(),
  });
  if (!image) return fail('The image is too large to store.');

  const kx = bridge();
  if (kx) {
    try {
      const saved = sanitizeWallpaperImage(await kx.wallpaperSave(image.dataUrl));
      if (!saved) return fail('The wallpaper could not be saved.');
      return { ok: true, message: 'Wallpaper set.', image: saved };
    } catch {
      return fail('The wallpaper could not be saved.');
    }
  }

  try {
    window.localStorage.setItem(KEY, JSON.stringify(image));
  } catch {
    return fail('The image is too large to store.');
  }
  return { ok: true, message: 'Wallpaper set.', image };
}

export async function clearWallpaper(): Promise<boolean> {
  const kx = bridge();
  if (kx) {
    try {
      return await kx.wallpaperClear();
    } catch {
      return false;
    }
  }
  try {
    window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
