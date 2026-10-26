/**
 * Decisions for the capture preview window.
 *
 * A capture leaves the renderer as base64 and lands in a small window of its own,
 * which needs three answers before it can be built: what kind of file it is, what
 * the user is looking at, and how big the window should be. Those are pure
 * functions so they can be tested without a window, a display or a dialog;
 * `capture-window.ts` owns the actual BrowserWindow.
 */
export const CAPTURE_LANGUAGES = ['en', 'es', 'de', 'fr'] as const;
export type CaptureLanguage = (typeof CAPTURE_LANGUAGES)[number];

/** Toolbar and footer, measured in CSS pixels, subtracted from the picture. */
export const PREVIEW_CHROME_HEIGHT = 132;
export const PREVIEW_MIN_WIDTH = 420;
export const PREVIEW_MIN_HEIGHT = 320;
export const PREVIEW_MAX_WIDTH = 1180;
export const PREVIEW_MAX_HEIGHT = 820;

export interface PreviewShape {
  kind: 'shot' | 'clip';
  width: number;
  height: number;
  target: string;
  language: CaptureLanguage;
}

export function previewKind(value: unknown): 'shot' | 'clip' {
  return value === 'clip' ? 'clip' : 'shot';
}

/** An unknown language falls back to English rather than to a blank toolbar. */
export function previewLanguage(value: unknown): CaptureLanguage {
  return typeof value === 'string' && (CAPTURE_LANGUAGES as readonly string[]).includes(value)
    ? (value as CaptureLanguage)
    : 'en';
}

/** A pixel count, or 0 when the renderer could not report one. */
export function previewDimension(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(16_384, Math.round(number));
}

/** What was captured, as one line: no control characters, never empty. */
export function previewTarget(value: unknown): string {
  const text =
    typeof value === 'string'
      ? value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
  return (text || 'Kryvex').slice(0, 80);
}

/**
 * The window's size: the picture's own shape where it fits, bounded to the
 * desktop so a 4K screenshot does not open larger than the screen it is on. A
 * recording reports no dimensions, so it gets a watching-sized default frame.
 */
export function previewBounds(
  width: number,
  height: number,
  work: { width: number; height: number },
): { width: number; height: number } {
  const maxWidth = Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, Math.floor(work.width * 0.82)));
  const maxHeight = Math.min(PREVIEW_MAX_HEIGHT, Math.max(PREVIEW_MIN_HEIGHT, Math.floor(work.height * 0.82)));

  if (!width || !height) {
    return { width: Math.min(980, maxWidth), height: Math.min(660, maxHeight) };
  }

  const scale = Math.min(1, maxWidth / width, (maxHeight - PREVIEW_CHROME_HEIGHT) / height);
  return {
    width: Math.max(PREVIEW_MIN_WIDTH, Math.min(maxWidth, Math.round(width * scale))),
    height: Math.max(PREVIEW_MIN_HEIGHT, Math.min(maxHeight, Math.round(height * scale) + PREVIEW_CHROME_HEIGHT)),
  };
}
