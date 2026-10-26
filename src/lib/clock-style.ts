import type { ClockAccent, ClockStyle, TypographyFont } from '../types';
import { TYPOGRAPHY_FONTS, fontStackFor } from './typography';

/**
 * The look of the board's clock.
 *
 * The clock is the first thing the board draws, so its appearance is a taste
 * setting rather than a fixed design: some people want Momentum's clean
 * unboxed type, some want the bordered card, some want a clock radio. Style,
 * accent and family are three independent choices — a mono clock in the accent
 * colour on a card is a valid combination — and the stylesheet owns the shape
 * while this module owns what is allowed through.
 */

export const CLOCK_STYLES: Array<{ id: ClockStyle; label: string }> = [
  { id: 'bare', label: 'Bare' },
  { id: 'card', label: 'Card' },
  // The label is a description, not the CSS family name, so it translates.
  { id: 'mono', label: 'Clock radio' },
];

export const CLOCK_ACCENTS: Array<{ id: ClockAccent; label: string }> = [
  { id: 'theme', label: 'Theme' },
  { id: 'accent', label: 'Accent' },
  { id: 'muted', label: 'Muted' },
];

/** The same curated families the typography setting offers, minus none. */
export const CLOCK_FONTS = TYPOGRAPHY_FONTS;

export const DEFAULT_CLOCK_STYLE: ClockStyle = 'bare';
export const DEFAULT_CLOCK_ACCENT: ClockAccent = 'theme';
export const DEFAULT_CLOCK_FONT: TypographyFont = 'default';

export function isClockStyle(value: unknown): value is ClockStyle {
  return CLOCK_STYLES.some(entry => entry.id === value);
}

export function isClockAccent(value: unknown): value is ClockAccent {
  return CLOCK_ACCENTS.some(entry => entry.id === value);
}

/**
 * The class names the board clock carries.
 *
 * The style is a class because the stylesheet switches whole blocks on it; the
 * accent and the family arrive as custom properties, because they only recolour
 * or restyle the time and must not override the size the style sets.
 */
export function clockClasses(
  style: ClockStyle,
  accent: ClockAccent,
  font: TypographyFont,
): string {
  const stack = fontStackFor(font);
  const classes = ['home-clock', `is-${style}`, `accent-${accent}`];
  if (font !== 'default' && stack) classes.push('has-font');
  return classes.join(' ');
}

/** Inline custom properties for the family, empty when the theme supplies it. */
export function clockStyleVars(font: TypographyFont): Record<string, string> {
  const stack = fontStackFor(font);
  return stack ? { '--clock-font': stack } : {};
}
