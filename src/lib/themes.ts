import themesJson from '../../brand/themes.json';
import tokensJson from '../../brand/tokens.json';

export interface Theme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  tokens: Record<string, string>;
}

export const THEMES: Theme[] = themesJson.themes as Theme[];
export const DEFAULT_THEME_ID = THEMES[0]?.id ?? 'kryvex-dark';
export const DEFAULT_THEME = THEMES[0] as Theme;

export function isThemeId(id: string): boolean {
  return THEMES.some(theme => theme.id === id);
}

export function getTheme(id: string): Theme {
  return THEMES.find(theme => theme.id === id) ?? DEFAULT_THEME;
}

/** The brand palette is the source of truth; the UI only consumes variables. */
export function applyTheme(id: string): Theme {
  const theme = getTheme(id);
  const root = document.documentElement;
  const t = theme.tokens;
  const color = tokensJson.color;

  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.style.colorScheme = theme.mode;

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
      theme.mode === 'light'
        ? (t.muted ?? color.inkMuted)
        : `color-mix(in srgb, ${t.muted ?? color.inkMuted} 68%, transparent)`,
    '--on-accent': theme.mode === 'light' ? '#FFFFFF' : '#06121B',
    '--accent': t.accent ?? color.accent,
    '--accent-soft': t.accentSoft ?? color.accentSoft,
    '--success': t.success ?? color.success,
    '--warning': t.warning ?? color.warning,
    '--danger': t.danger ?? color.danger,
    '--focus': t.accent ?? color.focus,
    '--accent-wash': `color-mix(in srgb, ${t.accent ?? color.accent} 14%, transparent)`,
    '--accent-wash-strong': `color-mix(in srgb, ${t.accent ?? color.accent} 24%, transparent)`,
    '--scrim': theme.mode === 'light' ? 'rgb(11 14 18 / 0.32)' : 'rgb(0 0 0 / 0.58)',
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
