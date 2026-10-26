/**
 * Rules for writing a capture.
 *
 * The renderer produces pixels, not files: it sends base64 and a suggested name,
 * and this decides what may actually be written. Nothing here touches Electron,
 * so the size caps, the base64 check and the name sanitising are unit-tested
 * without a window or a dialog. `capture-tools.ts` owns the dialog and the write.
 */
export const MAX_SHOT_BYTES = 64 * 1024 * 1024;
export const MAX_CLIP_BYTES = 128 * 1024 * 1024;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function captureExtension(kind: 'shot' | 'clip'): string {
  return kind === 'clip' ? 'webm' : 'png';
}

export function captureLimit(kind: 'shot' | 'clip'): number {
  return kind === 'clip' ? MAX_CLIP_BYTES : MAX_SHOT_BYTES;
}

/**
 * A file name with no directory, no traversal and the right extension.
 *
 * The suggested name comes from the renderer, which is trusted but not
 * authoritative: everything up to the last separator is dropped, characters a
 * filesystem refuses are replaced, and the extension is forced to match the kind
 * so a `.exe` cannot be proposed through the save dialog.
 */
export function captureFileName(raw: unknown, kind: 'shot' | 'clip'): string {
  const wanted = typeof raw === 'string' ? raw : '';
  const base = wanted.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
  // Any trailing extension goes, not just this one: a proposed `setup.exe`
  // must not become `setup.exe.png`.
  const stem = (base.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'kryvex-capture')
    .replace(/[^A-Za-z0-9._ ()-]+/g, '-')
    .replace(/^[.\s]+/, '')
    .slice(0, 90);
  return `${stem || 'kryvex-capture'}.${captureExtension(kind)}`;
}

/** Base64 to bytes, or null when it is not base64 or is too large either way. */
export function decodeCapture(raw: unknown, limit: number): Buffer | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // base64 is 4 characters per 3 bytes: reject on the string length first so a
  // huge payload is never copied just to be thrown away.
  if (raw.length > Math.ceil(limit / 3) * 4 + 4) return null;
  if (!BASE64.test(raw)) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > limit) return null;
  return bytes;
}
