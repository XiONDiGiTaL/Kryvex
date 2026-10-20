/**
 * Renderer entry point for the Chromium engine profile.
 *
 * The contract itself lives in `electron/chromium-rules.ts` so the main
 * process and the UI cannot disagree about defaults or validation; this module
 * only adds the presentation helpers the settings panel needs.
 */
export {
  CHROMIUM_ZOOM_STEPS,
  DEFAULT_CHROMIUM,
  sanitizeChromium,
  type ChromiumSettings,
} from '../../electron/chromium-rules';

/** The browser toolbar and Settings use the same label for a zoom factor. */
export function zoomLabel(factor: number): string {
  return `${Math.round(factor * 100)}%`;
}
