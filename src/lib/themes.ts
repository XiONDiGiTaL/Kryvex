import themesJson from '../../brand/themes.json';
import tokensJson from '../../brand/tokens.json';
import { PLUGIN_THEMES } from '../plugins';
import type { CustomTheme } from '../types';
import { mixHex, normalizeHex, readableInk, relativeLuminance } from './color';

export type ThemeFamily =
  | 'core'
  | 'spectrum'
  | 'element'
  | 'metal'
  | 'gem'
  | 'planet'
  | 'light'
  | 'terminal'
  | 'custom';

export interface Theme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  tokens: Record<string, string>;
  /** Two-letter periodic-table mark used by the picker. */
  symbol?: string;
  family?: ThemeFamily;
  /** Catalogue position; 0 is reserved for Custom. */
  number?: number;
  /** Accent-to-secondary gradient for buttons, marks and active outlines. */
  gradient?: boolean;
  /** Subtle reflected sheen on chrome surfaces. */
  glass?: boolean;
  /** Use the mono family for interface copy. */
  mono?: boolean;
  /** Theme shipped as a plugin rather than in the core theme file. */
  plugin?: boolean;
  /** Which brand mark the shell should show while this theme is active. */
  mark?: 'kx' | 'donkey' | 'xion';
}

/** Short labels used by the periodic table and the preview gallery. */
export const FAMILY_LABELS: Record<ThemeFamily, string> = {
  core: 'CORE',
  spectrum: 'SPECTRUM',
  element: 'ELEMENTS',
  metal: 'METALS',
  gem: 'GEMS',
  planet: 'PLANETS',
  light: 'LIGHT',
  terminal: 'TERMINAL',
  custom: 'CUSTOM',
};

export const CUSTOM_THEME_ID = 'custom';
export const CUSTOM_FAMILY_LABEL = 'custom';

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  name: 'Custom',
  bg: '#101418',
  surface: '#171D24',
  accent: '#F97316',
  accentSoft: '#FACC15',
  ink: '#F4F7FA',
};

export const THEMES: Theme[] = [...(themesJson.themes as Theme[]), ...PLUGIN_THEMES];
export const THEME_FAMILIES: ThemeFamily[] = [
  'core',
  'spectrum',
  'element',
  'metal',
  'gem',
  'planet',
  'light',
  'terminal',
];
export const DEFAULT_THEME_ID = THEMES[0]?.id ?? 'kryvex-dark';
export const DEFAULT_THEME = THEMES[0] as Theme;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Never trust a saved palette: every field is independently validated. */
export function sanitizeCustomTheme(raw: unknown): CustomTheme {
  const source = isRecord(raw) ? raw : {};
  const base = DEFAULT_CUSTOM_THEME;
  const name = typeof source.name === 'string' ? source.name.trim().slice(0, 40) : '';
  return {
    name: name || base.name,
    bg: normalizeHex(source.bg) ?? base.bg,
    surface: normalizeHex(source.surface) ?? base.surface,
    accent: normalizeHex(source.accent) ?? base.accent,
    accentSoft: normalizeHex(source.accentSoft) ?? base.accentSoft,
    ink: normalizeHex(source.ink) ?? base.ink,
  };
}

/**
 * The custom tile is generated from five user colours. Raised, line and muted
 * tones are mixed so a two-colour palette still produces a complete theme.
 */
export function buildCustomTheme(raw: unknown = DEFAULT_CUSTOM_THEME): Theme {
  const palette = sanitizeCustomTheme(raw);
  const mode = relativeLuminance(palette.bg) > 0.52 ? 'light' : 'dark';
  const tokens: Record<string, string> = {
    bg: palette.bg,
    surface: palette.surface,
    raised: mixHex(palette.surface, palette.ink, 0.06),
    line: mixHex(palette.surface, palette.ink, 0.24),
    ink: palette.ink,
    muted: mixHex(palette.ink, palette.bg, 0.38),
    accent: palette.accent,
    accentSoft: palette.accentSoft,
    success: mode === 'light' ? '#15803D' : '#4ADE80',
    warning: mode === 'light' ? '#B45309' : '#FBBF24',
    danger: mode === 'light' ? '#B91C1C' : '#F87171',
    onAccent: readableInk(palette.accent),
  };
  return {
    id: CUSTOM_THEME_ID,
    name: palette.name,
    mode,
    symbol: 'Cx',
    family: 'custom',
    number: 0,
    gradient: true,
    tokens,
  };
}

export function isThemeId(id: string): boolean {
  return id === CUSTOM_THEME_ID || THEMES.some(theme => theme.id === id);
}

export function getTheme(id: string, custom?: CustomTheme): Theme {
  if (id === CUSTOM_THEME_ID) return buildCustomTheme(custom);
  return THEMES.find(theme => theme.id === id) ?? DEFAULT_THEME;
}

/** The brand palette is the source of truth; the UI only consumes variables. */
export function applyTheme(id: string, custom?: CustomTheme): Theme {
  const theme = getTheme(id, custom);
  const root = document.documentElement;
  const t = theme.tokens;
  const color = tokensJson.color;
  const accent = t.accent ?? color.accent;
  const accentSoft = t.accentSoft ?? color.accentSoft;
  const mode = theme.mode;

  root.dataset.theme = theme.id;
  root.dataset.mode = mode;
  root.dataset.gradient = theme.gradient ? 'true' : 'false';
  root.dataset.glass = theme.glass ? 'true' : 'false';
  root.dataset.terminal = theme.mono ? 'true' : 'false';
  root.style.colorScheme = mode;

  const vars: Record<string, string> = {
    '--bg': t.bg ?? color.bg,
    '--surface': t.surface ?? color.surface,
    '--raised': t.raised ?? color.raised,
    '--line': t.line ?? color.border,
    '--line-soft': `color-mix(in srgb, ${t.line ?? color.border} 55%, transparent)`,
    '--ink': t.ink ?? color.ink,
    '--muted': t.muted ?? color.inkMuted,
    // On light surfaces a translucent muted tone is too washed out for 9px labels.
    '--ink-faint':
      mode === 'light'
        ? (t.muted ?? color.inkMuted)
        : `color-mix(in srgb, ${t.muted ?? color.inkMuted} 68%, transparent)`,
    '--on-accent': t.onAccent ?? (mode === 'light' ? '#FFFFFF' : '#06121B'),
    '--accent': accent,
    '--accent-soft': accentSoft,
    '--accent-gradient': theme.gradient
      ? `linear-gradient(135deg, ${accent}, ${accentSoft})`
      : accent,
    '--success': t.success ?? color.success,
    '--warning': t.warning ?? color.warning,
    '--danger': t.danger ?? color.danger,
    '--focus': accent,
    '--accent-wash': `color-mix(in srgb, ${accent} 14%, transparent)`,
    '--accent-wash-strong': `color-mix(in srgb, ${accent} 24%, transparent)`,
    '--scrim': mode === 'light' ? 'rgb(11 14 18 / 0.32)' : 'rgb(0 0 0 / 0.58)',
    '--font-sans': theme.mono ? tokensJson.type.mono : tokensJson.type.sans,
    '--font-ui': theme.mono ? tokensJson.type.mono : tokensJson.type.sans,
    '--shine': theme.glass
      ? 'linear-gradient(118deg, rgb(255 255 255 / 0.26), transparent 34%, rgb(255 255 255 / 0.08) 68%, transparent 84%)'
      : 'none',
  };

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }

  return theme;
}

/** Layout/type tokens are shared across themes and applied once at boot. */
export function applyBaseTokens(): void {
  const root = document.documentElement;
  const { radius, spacing, type, motion, layout } = tokensJson;
  const px = (value: number): string => `${value}px`;

  const vars: Record<string, string> = {
    '--r-xs': px(radius.xs),
    '--r-sm': px(radius.sm),
    '--r-md': px(radius.md),
    '--r-lg': px(radius.lg),
    '--r-xl': px(radius.xl),
    '--s-xxs': px(spacing.xxs),
    '--s-xs': px(spacing.xs),
    '--s-sm': px(spacing.sm),
    '--s-md': px(spacing.md),
    '--s-lg': px(spacing.lg),
    '--s-xl': px(spacing.xl),
    '--s-xxl': px(spacing.xxl),
    '--s-xxxl': px(spacing.xxxl),
    '--font-sans': type.sans,
    '--font-ui': type.sans,
    '--font-mono': type.mono,
    '--text-xs': px(type.sizes.xs),
    '--text-sm': px(type.sizes.sm),
    '--text-md': px(type.sizes.md),
    '--text-lg': px(type.sizes.lg),
    '--text-xl': px(type.sizes.xl),
    '--text-title': px(type.sizes.title),
    '--motion-fast': `${motion.fast}ms`,
    '--motion-base': `${motion.base}ms`,
    '--motion-slow': `${motion.slow}ms`,
    '--ease': motion.easing,
    '--sidebar-rail': px(layout.sidebar.rail),
    '--sidebar-width': px(layout.sidebar.expanded),
    '--header-height': px(layout.header),
    '--status-height': px(layout.statusbar),
  };

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
}
