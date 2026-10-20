/**
 * Chromium engine preferences that Kryvex exposes in Settings.
 *
 * Every field maps to a real Electron/Chromium switch or web preference; none
 * of them is decoration. Three kinds of change exist:
 *
 *   - launch switches (`disable-smooth-scrolling`, hardware acceleration) are
 *     applied before `app.whenReady()` and need a restart,
 *   - guest web preferences are applied when a <webview> attaches, so an open
 *     page must reload,
 *   - `colorScheme` is live: it drives `nativeTheme.themeSource`, which changes
 *     `prefers-color-scheme` in every page immediately.
 *
 * This module stays free of Electron imports so the renderer store, the main
 * process and the unit tests can share one sanitizer.
 */

export type ChromiumColorScheme = 'system' | 'light' | 'dark';

export interface ChromiumSettings {
  /** GPU compositing. Off is a real `app.disableHardwareAcceleration()`. */
  hardwareAcceleration: boolean;
  /** `--disable-smooth-scrolling`; applies to the shell and every page. */
  smoothScrolling: boolean;
  /** Page scripts. Off leaves pages static, including sign-in forms. */
  javascript: boolean;
  /** Automatic image loading. */
  images: boolean;
  /** WebGL and 3D canvas contexts. */
  webgl: boolean;
  /** Chromium's built-in PDF viewer instead of downloading the file. */
  pdfViewer: boolean;
  /** Allow media with sound to start without a click. */
  autoplay: boolean;
  /** Slow timers in hidden pages to save power (Chromium's default). */
  backgroundThrottling: boolean;
  /** Chromium spellcheck in text fields. */
  spellcheck: boolean;
  /** Preferred colour scheme advertised to pages. */
  colorScheme: ChromiumColorScheme;
  /** Default page zoom factor, snapped to the browser's zoom steps. */
  defaultZoom: number;
}

/** The same steps the browser toolbar uses; kept in sync by a test. */
export const CHROMIUM_ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

// The defaults keep the behaviour Kryvex shipped before the panel existed:
// autoplay allowed (Electron's own default) and hidden service apps left at
// full speed so calls and feeds stay live.
export const DEFAULT_CHROMIUM: ChromiumSettings = {
  hardwareAcceleration: true,
  smoothScrolling: true,
  javascript: true,
  images: true,
  webgl: true,
  pdfViewer: false,
  autoplay: true,
  backgroundThrottling: false,
  spellcheck: true,
  colorScheme: 'system',
  defaultZoom: 1,
};

const BOOLEAN_KEYS = [
  'hardwareAcceleration',
  'smoothScrolling',
  'javascript',
  'images',
  'webgl',
  'pdfViewer',
  'autoplay',
  'backgroundThrottling',
  'spellcheck',
] as const;

const COLOR_SCHEMES: ChromiumColorScheme[] = ['system', 'light', 'dark'];

/** Off-step or absurd saved values collapse to the nearest real zoom step. */
export function snapZoom(value: unknown): number {
  const factor = Number(value);
  if (!Number.isFinite(factor) || factor <= 0) return DEFAULT_CHROMIUM.defaultZoom;
  return CHROMIUM_ZOOM_STEPS.reduce(
    (best, step) => (Math.abs(step - factor) < Math.abs(best - factor) ? step : best),
    CHROMIUM_ZOOM_STEPS[0],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The state file is user-editable, so only known fields survive and every
 * value keeps its type. A damaged file falls back to the defaults.
 */
export function sanitizeChromium(raw: unknown): ChromiumSettings {
  const next: ChromiumSettings = { ...DEFAULT_CHROMIUM };
  if (!isRecord(raw)) return next;
  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === 'boolean') next[key] = raw[key] as boolean;
  }
  if (COLOR_SCHEMES.includes(raw.colorScheme as ChromiumColorScheme)) {
    next.colorScheme = raw.colorScheme as ChromiumColorScheme;
  }
  next.defaultZoom = snapZoom(raw.defaultZoom);
  return next;
}

/** Reads `settings.chromium` from a whole persisted state document. */
export function chromiumFromState(raw: unknown): ChromiumSettings {
  if (!isRecord(raw) || !isRecord(raw.settings)) return { ...DEFAULT_CHROMIUM };
  return sanitizeChromium(raw.settings.chromium);
}

/**
 * Switches that must exist before Chromium starts. Graphics acceleration is
 * not a switch: Electron applies it with `app.disableHardwareAcceleration()`.
 */
export function chromiumSwitches(
  settings: ChromiumSettings,
): Array<{ name: string; value?: string }> {
  const switches: Array<{ name: string; value?: string }> = [];
  if (!settings.smoothScrolling) switches.push({ name: 'disable-smooth-scrolling' });
  return switches;
}

export interface ChromiumWebPreferences {
  javascript: boolean;
  images: boolean;
  webgl: boolean;
  plugins: boolean;
  spellcheck: boolean;
  backgroundThrottling: boolean;
  autoplayPolicy: 'no-user-gesture-required' | 'document-user-activation-required';
  zoomFactor: number;
}

/**
 * Applied by the main process on `will-attach-webview`, so the guest is built
 * with these values rather than corrected after it loads.
 */
export function chromiumWebPreferences(settings: ChromiumSettings): ChromiumWebPreferences {
  return {
    javascript: settings.javascript,
    images: settings.images,
    webgl: settings.webgl,
    plugins: settings.pdfViewer,
    spellcheck: settings.spellcheck,
    backgroundThrottling: settings.backgroundThrottling,
    autoplayPolicy: settings.autoplay
      ? 'no-user-gesture-required'
      : 'document-user-activation-required',
    zoomFactor: settings.defaultZoom,
  };
}

export interface EngineGpu {
  compositing: string;
  webgl: string;
  rasterization: string;
}

/** What a live <webview> was actually built with, read back from Electron. */
export interface EngineGuest {
  id: number;
  url: string;
  zoomFactor: number;
  applied: ChromiumWebPreferences | null;
  attachedAt: number | null;
}

/** The engine report Settings shows next to the controls. */
export interface EngineInfo {
  chrome: string;
  electron: string;
  profile: ChromiumSettings;
  accelerated: boolean;
  gpu: EngineGpu;
  switches: string[];
  guests: EngineGuest[];
}

/** Settings that only take effect after a full restart. */
export const CHROMIUM_RESTART_FIELDS: ReadonlyArray<keyof ChromiumSettings> = [
  'hardwareAcceleration',
  'smoothScrolling',
];

/** Settings that apply to new guests; open pages need a reload. */
export const CHROMIUM_RELOAD_FIELDS: ReadonlyArray<keyof ChromiumSettings> = [
  'javascript',
  'images',
  'webgl',
  'pdfViewer',
  'autoplay',
  'backgroundThrottling',
  'spellcheck',
  'defaultZoom',
];
