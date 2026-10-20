import fs from 'node:fs';
import path from 'node:path';

/**
 * The wallpaper is the one user image Kryvex keeps on disk. It lives in its
 * own folder beside kryvex-state.json so the state file stays small and the
 * renderer only ever receives a data URL it can paint.
 */
const MAX_BYTES = 8 * 1024 * 1024;
const KINDS = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
} as const;

export type WallpaperExt = keyof typeof KINDS;

export interface WallpaperRecord {
  dataUrl: string;
  bytes: number;
  addedAt: number;
}

const MIME_TO_EXT: Record<string, WallpaperExt> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export interface DecodedImage {
  bytes: Buffer;
  ext: WallpaperExt;
  mime: string;
}

/** Accepts only base64 raster data URLs; SVG is excluded on purpose. */
export function decodeImageDataUrl(raw: unknown): DecodedImage | null {
  if (typeof raw !== 'string' || raw.length > MAX_BYTES * 2) return null;
  const match = /^data:(image\/(?:png|jpeg|webp|avif|gif));base64,([a-z0-9+/=]+)$/i.exec(raw);
  if (!match?.[1] || !match[2]) return null;
  const mime = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mime];
  if (!ext) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > MAX_BYTES || !matchesSignature(bytes, ext)) return null;
  return { bytes, ext, mime };
}

/** Reject a payload whose magic bytes disagree with its declared type. */
function matchesSignature(bytes: Buffer, ext: WallpaperExt): boolean {
  if (ext === 'png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === 'jpg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (ext === 'gif') return bytes.subarray(0, 4).toString('ascii') === 'GIF8';
  if (ext === 'webp')
    return (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  if (ext === 'avif') return bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  return false;
}

function folder(userData: string): string {
  return path.join(userData, 'wallpaper');
}

function currentFile(userData: string): { file: string; ext: WallpaperExt } | null {
  try {
    const dir = folder(userData);
    for (const name of fs.readdirSync(dir)) {
      const ext = path.extname(name).slice(1).toLowerCase() as WallpaperExt;
      if (name.startsWith('wallpaper.') && ext in KINDS) {
        return { file: path.join(dir, name), ext };
      }
    }
  } catch {
    /* no wallpaper yet */
  }
  return null;
}

export function readWallpaper(userData: string): WallpaperRecord | null {
  const found = currentFile(userData);
  if (!found) return null;
  try {
    const stats = fs.statSync(found.file);
    if (stats.size === 0 || stats.size > MAX_BYTES) return null;
    const bytes = fs.readFileSync(found.file);
    return {
      dataUrl: `data:${KINDS[found.ext]};base64,${bytes.toString('base64')}`,
      bytes: stats.size,
      addedAt: Math.round(stats.mtimeMs),
    };
  } catch {
    return null;
  }
}

/** Writes atomically and drops any previous image so only one file exists. */
export function writeWallpaper(userData: string, raw: unknown): WallpaperRecord | null {
  const decoded = decodeImageDataUrl(raw);
  if (!decoded) return null;
  const dir = folder(userData);
  const target = path.join(dir, `wallpaper.${decoded.ext}`);
  const temp = `${target}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('wallpaper.')) fs.rmSync(path.join(dir, entry), { force: true });
    }
    fs.writeFileSync(temp, decoded.bytes);
    fs.renameSync(temp, target);
  } catch {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      /* best effort */
    }
    return null;
  }
  return {
    dataUrl: raw as string,
    bytes: decoded.bytes.length,
    addedAt: Date.now(),
  };
}

export function clearWallpaper(userData: string): boolean {
  const dir = folder(userData);
  if (!fs.existsSync(dir)) return true;
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('wallpaper.')) fs.rmSync(path.join(dir, entry), { force: true });
    }
    return true;
  } catch {
    return false;
  }
}
