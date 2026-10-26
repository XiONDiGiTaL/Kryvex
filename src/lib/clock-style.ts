import type { ClockAccent, ClockAlign, ClockStyle, TypographyFont } from '../types';
import { TYPOGRAPHY_FONTS, fontStackFor } from './typography';

/**
 * The look of the board's clock.
 *
 * The clock is the first thing the board draws, so its appearance is a taste
 * setting rather than a fixed design: some people want Momentum's clean
 * unboxed type, some want the bordered card, some want a clock radio. Style,
 * accent, family, size and alignment are independent choices — a mono clock in
 * the accent colour on a card is a valid combination — and the stylesheet owns
 * the shape while this module owns what is allowed through.
 */

export const CLOCK_STYLES: Array<{ id: ClockStyle; label: string }> = [
  { id: 'bare', label: 'Bare' },
  { id: 'card', label: 'Card' },
  // The label is a description, not the CSS family name, so it translates.
  { id: 'mono', label: 'Clock radio' },
  { id: 'outline', label: 'Outline' },
  { id: 'classic', label: 'Classic' },
];

export const CLOCK_ACCENTS: Array<{ id: ClockAccent; label: string }> = [
  { id: 'theme', label: 'Theme' },
  { id: 'accent', label: 'Accent' },
  { id: 'muted', label: 'Muted' },
];

export const CLOCK_ALIGNS: Array<{ id: ClockAlign; label: string }> = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Centre' },
  { id: 'right', label: 'Right' },
];

/** The same curated families the typography setting offers, minus none. */
export const CLOCK_FONTS = TYPOGRAPHY_FONTS;

export const DEFAULT_CLOCK_STYLE: ClockStyle = 'bare';
export const DEFAULT_CLOCK_ACCENT: ClockAccent = 'theme';
export const DEFAULT_CLOCK_FONT: TypographyFont = 'default';
export const DEFAULT_CLOCK_SCALE = 100;
export const DEFAULT_CLOCK_ALIGN: ClockAlign = 'left';

/**
 * The size is a percentage so it composes with the responsive `clamp()` the
 * stylesheet already uses: 100% is the design size at every viewport, 70% is a
 * quiet corner clock and 180% is a wall clock.
 */
export const MIN_CLOCK_SCALE = 70;
export const MAX_CLOCK_SCALE = 180;

export const CLOCK_SCALE_STEPS: readonly number[] = [70, 85, 100, 120, 145, 180];

export function isClockStyle(value: unknown): value is ClockStyle {
  return CLOCK_STYLES.some(entry => entry.id === value);
}

export function isClockAccent(value: unknown): value is ClockAccent {
  return CLOCK_ACCENTS.some(entry => entry.id === value);
}

export function isClockAlign(value: unknown): value is ClockAlign {
  return CLOCK_ALIGNS.some(entry => entry.id === value);
}

/** Clamps a saved size into the supported band, falling back to the default. */
export function sanitizeClockScale(raw: unknown): number {
  // `Number(null)` and `Number('')` are both 0, which would read as a request
  // for the smallest clock; only a number or a numeric string is a request.
  if (raw === null || raw === undefined || raw === '') return DEFAULT_CLOCK_SCALE;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_CLOCK_SCALE;
  return Math.min(MAX_CLOCK_SCALE, Math.max(MIN_CLOCK_SCALE, Math.round(value)));
}

/**
 * The class names the board clock carries.
 *
 * The style is a class because the stylesheet switches whole blocks on it; the
 * accent, family, size and alignment arrive as custom properties or data
 * attributes, because they only recolour or restyle the digits and must not
 * override the shape the style sets.
 */
export function clockClasses(
  style: ClockStyle,
  accent: ClockAccent,
  font: TypographyFont,
  align: ClockAlign = DEFAULT_CLOCK_ALIGN,
): string {
  const stack = fontStackFor(font);
  const classes = ['home-clock', `is-${style}`, `accent-${accent}`, `align-${align}`];
  if (font !== 'default' && stack) classes.push('has-font');
  return classes.join(' ');
}

/**
 * Inline custom properties for the family and the size. The size multiplies the
 * stylesheet's own `clamp()`, so a bigger clock still shrinks on a narrow board
 * instead of overflowing it.
 */
export function clockStyleVars(
  font: TypographyFont,
  scale: number = DEFAULT_CLOCK_SCALE,
): Record<string, string> {
  const stack = fontStackFor(font);
  const vars: Record<string, string> = { '--clock-scale': String(sanitizeClockScale(scale) / 100) };
  if (stack) vars['--clock-font'] = stack;
  return vars;
}
