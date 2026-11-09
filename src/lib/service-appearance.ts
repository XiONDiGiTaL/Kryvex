import type { CustomTheme, ServiceAppearance, ServiceAppearanceSkin } from '../types';
import { getTheme, isThemeId, type Theme } from './themes';

/**
 * A service's appearance is a stylesheet, never a script.
 *
 * A module holds a signed-in profile, so nothing here evaluates JavaScript in
 * it; the renderer hands one sheet to `webview.insertCSS` and Chromium paints
 * it. That is the same boundary the userscript engine keeps, and the reason
 * this file only ever produces CSS text from a palette that Kryvex owns.
 *
 * Two kinds of palette feed it. `follow` reuses whichever theme the shell has
 * applied — so a planet theme can dress Discord exactly as it dresses Kryvex —
 * and `graphite`/`arcade` are fixed skins. A specific catalogue theme can be
 * pinned per service with `theme`.
 */

const COLOR = /^#[0-9a-f]{3,8}$/i;

/** A generated sheet is small; this only stops a runaway from reaching a page. */
const MAX_SHEET = 24_000;

/** The palette from `docs/userscripts/discord-theme.user.js`, as a theme. */
export const GRAPHITE_SKIN: Theme = {
  id: 'graphite-skin',
  name: 'Kryvex Graphite',
  mode: 'dark',
  symbol: 'Gr',
  family: 'custom',
  tokens: {
    bg: '#12141a',
    surface: '#181b23',
    raised: '#1f2430',
    line: '#2c3445',
    ink: '#e6e8ee',
    muted: '#9aa3b5',
    accent: '#8b7cf6',
    accentSoft: '#a396ff',
    onAccent: '#0b0d12',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
  },
};

/**
 * Blue on near-black, taken from xiondigital.net/arcade: `--bg #050607`,
 * `--panel #0c0e11`, `--blue #3f80ff`, `--ink #ecedef`, `--muted #8b9099`.
 */
export const ARCADE_SKIN: Theme = {
  id: 'arcade-skin',
  name: 'Arcade',
  mode: 'dark',
  symbol: 'Ar',
  family: 'custom',
  tokens: {
    bg: '#050607',
    surface: '#0c0e11',
    raised: '#101318',
    line: '#1b1f26',
    ink: '#ecedef',
    muted: '#8b9099',
    accent: '#3f80ff',
    accentSoft: '#79a8ff',
    onAccent: '#ffffff',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
  },
};

const SKINS: ServiceAppearanceSkin[] = ['off', 'follow', 'graphite', 'arcade', 'theme'];

export function isSkin(value: unknown): value is ServiceAppearanceSkin {
  return typeof value === 'string' && SKINS.includes(value as ServiceAppearanceSkin);
}

/**
 * A saved appearance, or `undefined` for "leave the site alone".
 *
 * Off is stored as absence rather than as a record, so a profile that never
 * touched the control stays exactly as it was. A `theme` pick with no valid
 * theme behind it is off too, because guessing a palette would be worse than
 * doing nothing.
 */
export function sanitizeServiceAppearance(raw: unknown): ServiceAppearance | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const skin = record.skin;
  if (!isSkin(skin) || skin === 'off') return undefined;
  if (skin === 'theme') {
    const themeId = typeof record.themeId === 'string' ? record.themeId : '';
    return isThemeId(themeId) ? { skin, themeId } : undefined;
  }
  return { skin };
}

/** The value a `<select>` shows for an appearance. */
export function appearanceValueFor(appearance: ServiceAppearance | undefined): string {
  if (!appearance) return 'off';
  if (appearance.skin === 'theme') {
    return appearance.themeId && isThemeId(appearance.themeId)
      ? `theme:${appearance.themeId}`
      : 'off';
  }
  return appearance.skin;
}

/** The inverse: what a chosen value means, validated as a saved one would be. */
export function parseAppearanceValue(value: string): ServiceAppearance | undefined {
  if (value.startsWith('theme:')) {
    return sanitizeServiceAppearance({ skin: 'theme', themeId: value.slice(6) });
  }
  return sanitizeServiceAppearance({ skin: value });
}

export type AppearanceTarget = 'discord' | 'generic';

/**
 * Which sheet a page can take.
 *
 * Discord publishes its own custom properties, so it can be recoloured exactly.
 * Any other site only gets the generic sheet, which tints the page's backdrop,
 * text, links, selection and scrollbars rather than pretending to redesign it.
 */
export function appearanceTargetFor(url: string): AppearanceTarget {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'generic';
  }
  const discord =
    host === 'discord.com' ||
    host.endsWith('.discord.com') ||
    host === 'discordapp.com' ||
    host.endsWith('.discordapp.com');
  return discord ? 'discord' : 'generic';
}

export interface AppearanceContext {
  target: AppearanceTarget;
  /** The app's active theme, already resolved (Custom included). */
  theme: Theme;
  customTheme?: CustomTheme;
}

/** The palette an appearance resolves to, or null when it is off. */
export function resolveAppearanceTheme(
  appearance: ServiceAppearance | undefined,
  context: AppearanceContext,
): Theme | null {
  if (!appearance) return null;
  switch (appearance.skin) {
    case 'graphite':
      return GRAPHITE_SKIN;
    case 'arcade':
      return ARCADE_SKIN;
    case 'follow':
      return context.theme;
    case 'theme':
      return appearance.themeId ? getTheme(appearance.themeId, context.customTheme) : null;
    default:
      return null;
  }
}

function colour(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && COLOR.test(value) ? value : fallback;
}

/** `#rrggbb` + two hex digits, for translucent washes. */
function alpha(hex: string, suffix: string): string {
  return hex.length === 7 ? `${hex}${suffix}` : hex;
}

/**
 * Discord's own stylesheet variables. This is the same list the shipped
 * userscript sets, minus its fixed values: the colours come from the theme
 * here, which is what lets a planet theme reach the module.
 */
function discordSheet(theme: Theme): string {
  const t = theme.tokens;
  const bg = colour(t.bg, GRAPHITE_SKIN.tokens.bg ?? '#12141a');
  const surface = colour(t.surface, GRAPHITE_SKIN.tokens.surface ?? '#181b23');
  const raised = colour(t.raised, GRAPHITE_SKIN.tokens.raised ?? '#1f2430');
  const ink = colour(t.ink, GRAPHITE_SKIN.tokens.ink ?? '#e6e8ee');
  const muted = colour(t.muted, GRAPHITE_SKIN.tokens.muted ?? '#9aa3b5');
  const accent = colour(t.accent, GRAPHITE_SKIN.tokens.accent ?? '#8b7cf6');
  const accentSoft = colour(t.accentSoft, GRAPHITE_SKIN.tokens.accentSoft ?? '#a396ff');
  const line = colour(t.line, GRAPHITE_SKIN.tokens.line ?? '#2c3445');
  const onAccent = colour(t.onAccent, '#ffffff');

  return `/* Kryvex appearance: ${theme.name} */
:root,
html.theme-dark,
html.theme-darker,
html.theme-midnight,
html.theme-light {
  color-scheme: ${theme.mode};
  --background-primary: ${surface};
  --background-secondary: ${bg};
  --background-secondary-alt: ${bg};
  --background-tertiary: ${bg};
  --background-accent: ${raised};
  --background-floating: ${raised};
  --background-nested-floating: ${raised};
  --background-mobile-primary: ${surface};
  --background-mobile-secondary: ${bg};
  --background-modifier-hover: ${alpha(ink, '0a')};
  --background-modifier-active: ${alpha(ink, '12')};
  --background-modifier-selected: ${alpha(accent, '2e')};
  --background-modifier-accent: ${alpha(ink, '0f')};
  --channeltextarea-background: ${raised};
  --activity-card-background: ${raised};
  --deprecated-card-bg: ${raised};
  --deprecated-card-editable-bg: ${raised};
  --deprecated-store-bg: ${bg};
  --deprecated-text-input-bg: ${raised};
  --text-normal: ${ink};
  --text-primary: ${ink};
  --text-secondary: ${muted};
  --text-muted: ${muted};
  --text-link: ${accent};
  --header-primary: ${ink};
  --header-secondary: ${muted};
  --channels-default: ${muted};
  --interactive-normal: ${muted};
  --interactive-hover: ${ink};
  --interactive-active: ${ink};
  --interactive-muted: ${alpha(muted, '66')};
  --brand-experiment: ${accent};
  --brand-500: ${accent};
  --brand-560: ${accentSoft};
  --brand-experiment-560: ${accentSoft};
  --scrollbar-thin-thumb: ${line};
  --scrollbar-auto-thumb: ${line};
  --scrollbar-auto-scrollbar-color-thumb: ${line};
  --scrollbar-auto-track: transparent;
  --scrollbar-thin-track: transparent;
}

body {
  background: ${bg};
}

::selection {
  background: ${alpha(accent, '55')};
  color: ${onAccent};
}
`;
}

/**
 * Any other site. Nothing here claims to restyle a page it has never seen: it
 * changes the backdrop, the default ink, links and the two visible selection
 * surfaces, which is enough for a dark theme to stop looking out of place.
 */
function genericSheet(theme: Theme): string {
  const t = theme.tokens;
  const bg = colour(t.bg, GRAPHITE_SKIN.tokens.bg ?? '#12141a');
  const ink = colour(t.ink, GRAPHITE_SKIN.tokens.ink ?? '#e6e8ee');
  const accent = colour(t.accent, GRAPHITE_SKIN.tokens.accent ?? '#8b7cf6');
  const line = colour(t.line, GRAPHITE_SKIN.tokens.line ?? '#2c3445');
  const onAccent = colour(t.onAccent, '#ffffff');

  return `/* Kryvex appearance: ${theme.name} */
:root {
  color-scheme: ${theme.mode};
}

html,
body {
  background-color: ${bg} !important;
  color: ${ink} !important;
}

a,
a:visited {
  color: ${accent} !important;
}

::selection {
  background: ${alpha(accent, '55')};
  color: ${onAccent};
}

* {
  scrollbar-color: ${line} ${bg};
}
`;
}

/**
 * The sheet to insert for a service, or an empty string when it is off.
 *
 * The result is either empty or a complete stylesheet built from validated hex
 * values; a caller can hand it straight to `insertCSS` without inspection.
 */
export function buildServiceCss(
  appearance: ServiceAppearance | undefined,
  context: AppearanceContext,
): string {
  const theme = resolveAppearanceTheme(appearance, context);
  if (!theme) return '';
  const sheet = context.target === 'discord' ? discordSheet(theme) : genericSheet(theme);
  return sheet.length <= MAX_SHEET ? sheet : '';
}

/** Exposed for the test that every catalogue theme produces a valid sheet. */
export const APPEARANCE_SHEET_LIMIT = MAX_SHEET;
