import type { TypographyFont, TypographySettings } from '../types';
import tokensJson from '../../brand/tokens.json';

/**
 * Global text appearance.
 *
 * The UI already draws every size from six `--text-*` tokens, so scaling the
 * tokens is enough to change the whole interface without touching a single
 * component — and it deliberately does not reach inside a webview, an iframe or
 * a media player, where the page owns its own typography.
 *
 * The family list is a curated stack of fonts that ship with Windows, macOS or
 * the app's own Inter: nothing is downloaded, so the choice applies instantly
 * and offline. A terminal theme forces a monospace family; picking a family here
 * is an explicit user choice and wins over that default.
 */

export const TYPOGRAPHY_FONTS: Array<{ id: TypographyFont; label: string; stack: string }> = [
  { id: 'default', label: 'Inter', stack: '' },
  {
    id: 'system',
    label: 'System UI',
    stack: "system-ui, 'Segoe UI Variable Text', 'Segoe UI', -apple-system, sans-serif",
  },
  {
    id: 'humanist',
    label: 'Humanist',
    stack: "'Segoe UI Variable Text', 'Trebuchet MS', Verdana, Tahoma, sans-serif",
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  },
  {
    id: 'mono',
    label: 'Monospace',
    stack: "'Cascadia Mono', 'JetBrains Mono', Consolas, ui-monospace, monospace",
  },
];

export const MIN_TEXT_SCALE = 85;
export const MAX_TEXT_SCALE = 135;
export const TEXT_SCALE_STEP = 5;

export const DEFAULT_TYPOGRAPHY: TypographySettings = { scale: 100, font: 'default' };

export function isTypographyFont(value: unknown): value is TypographyFont {
  return TYPOGRAPHY_FONTS.some(font => font.id === value);
}

/** Clamps to the supported range and falls back to the default for a bad value. */
export function sanitizeTypography(raw: unknown): TypographySettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TYPOGRAPHY };
  const record = raw as Record<string, unknown>;
  const requested = Number(record.scale);
  const scale = Number.isFinite(requested)
    ? Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, Math.round(requested)))
    : DEFAULT_TYPOGRAPHY.scale;
  const font = isTypographyFont(record.font) ? record.font : DEFAULT_TYPOGRAPHY.font;
  return { scale, font };
}

export function fontStackFor(font: TypographyFont): string {
  return TYPOGRAPHY_FONTS.find(entry => entry.id === font)?.stack ?? '';
}

/** Token names and their base sizes, in the order the stylesheet uses them. */
const BASE_SIZES = tokensJson.type.sizes as Record<
  'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'title',
  number
>;

export function scaledSize(base: number, scale: number): number {
  const factor = Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, scale)) / 100;
  // Whole pixels keep text crisp; a 90% scale of 11px is 10px, not 9.9px.
  return Math.max(9, Math.round(base * factor));
}

/**
 * Writes the six size tokens and the family onto the document root. Called
 * after `applyTheme`, because a theme also sets `--font-sans`.
 */
export function applyTypography(settings: TypographySettings): void {
  const root = document.documentElement;
  for (const [name, base] of Object.entries(BASE_SIZES)) {
    root.style.setProperty(`--text-${name}`, `${scaledSize(base, settings.scale)}px`);
  }
  const stack = fontStackFor(settings.font);
  if (stack) {
    root.style.setProperty('--font-sans', stack);
    root.style.setProperty('--font-ui', stack);
  } else {
    // "Default" means whatever the theme chose. A terminal theme asks for its
    // monospace family, and `applyTheme` records that choice on the root.
    const family = root.dataset.terminal === 'true' ? tokensJson.type.mono : tokensJson.type.sans;
    root.style.setProperty('--font-sans', family);
    root.style.setProperty('--font-ui', family);
  }
  root.dataset.textScale = String(settings.scale);
}
