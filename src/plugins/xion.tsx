import type { Theme } from '../lib/themes';

/**
 * Special XiØN Edition: the creator's signature theme.
 *
 * The darkest base in the catalogue with one electric blue (`#33B5E5`), a
 * glass sheen and the XiØN blade mark in place of the element tile. Glow and
 * liquid motion live in `styles.css` behind `data-theme="special-xion"` so the
 * theme stays a plain token object like every other entry.
 */
export const SPECIAL_XION_THEME: Theme = {
  id: 'special-xion',
  name: 'Special XiØN Edition',
  mode: 'dark',
  symbol: 'Xi',
  family: 'custom',
  number: 39,
  plugin: true,
  mark: 'xion',
  gradient: true,
  glass: true,
  tokens: {
    bg: '#04060A',
    surface: '#080C12',
    raised: '#0E141C',
    line: '#1D2A36',
    ink: '#EAF4FB',
    muted: '#8CA2B4',
    accent: '#33B5E5',
    accentSoft: '#7FE3FF',
    success: '#3EE0A6',
    warning: '#F2C14E',
    danger: '#FF6B7A',
    onAccent: '#021019',
  },
};

export const XION_PLUGIN = {
  id: 'special-xion',
  name: 'Special XiØN Edition',
  author: 'XiØN',
  description:
    'Near-black glass with one electric blue, the XiØN blade mark, a soft accent glow and liquid progress fills. The full-power Kryvex skin.',
  themeId: SPECIAL_XION_THEME.id,
  markColor: '#33B5E5',
  activatedMessage: 'Special XiØN Edition engaged. Full power.',
} as const;

/**
 * XiØN blade mark, drawn from the creator's own logotype as flat polygons.
 * The silhouette carries the long upper blade, the two crossbars and the
 * sweeping lower legs, so it still reads at 12px in the status bar.
 */
const XION_PATHS = [
  'M22.54 2.00 32.23 17.41 33.92 23.00 33.53 25.86 30.60 28.39 24.17 18.71 21.89 16.95 10.00 17.15 12.53 22.02 20.07 22.67 26.90 31.71 14.94 42.50 11.69 47.57 10.71 51.53 10.00 49.00 11.69 42.50 15.07 37.43 20.79 32.36 19.94 31.77 16.30 34.24 9.09 41.72 5.71 50.17 5.71 55.50 7.33 60.37 28.07 44.32 28.00 42.56 21.24 45.42 19.75 44.19 29.30 34.37 39.31 45.81 44.90 46.20 50.62 50.23 55.76 49.78 48.35 42.89 42.82 32.16 40.16 32.49 40.81 36.65 39.83 38.01 33.53 32.75 33.14 31.84 38.21 25.99 38.21 20.14 32.88 12.47 Z',
  'M45.81 16.82 40.94 19.62 40.29 22.61 41.26 25.92 42.56 22.28 52.96 22.02 57.97 17.15 Z',
  'M58.29 20.20 54.00 24.10 43.80 24.95 44.25 25.79 45.81 24.75 54.26 24.49 57.45 22.22 Z',
  'M39.18 28.65 36.52 31.71 37.10 33.07 40.03 29.50 Z',
  'M28.91 46.59 9.22 62.00 12.27 60.89 24.10 51.66 Z',
];

export function XionMark({
  size = 24,
  variant = 'solid',
  className,
}: {
  size?: number;
  variant?: 'solid' | 'tile';
  className?: string;
}) {
  const glyph = (
    <g fill="currentColor">
      {XION_PATHS.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </g>
  );

  if (variant === 'tile') {
    return (
      <svg
        className={`xion-mark ${className ?? ''}`}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="Special XiØN Edition"
      >
        <rect x="1.2" y="1.2" width="61.6" height="61.6" rx="12" fill="currentColor" opacity="0.06" />
        <rect
          x="1.2"
          y="1.2"
          width="61.6"
          height="61.6"
          rx="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
          opacity="0.4"
        />
        {glyph}
      </svg>
    );
  }

  return (
    <svg
      className={`xion-mark ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Special XiØN Edition"
    >
      {glyph}
    </svg>
  );
}
