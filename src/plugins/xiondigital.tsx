import type { Theme } from '../lib/themes';

/**
 * xiondigital.net Edition: the creator's site skin.
 *
 * The palette is lifted from the live site and its arcade stylesheet, which
 * both define `--bg: #050607`, `--panel: #0c0e11`, `--ink: #ecedef`,
 * `--muted: #8b9099`, `--blue: #3f80ff` and `--blue-hi: #79a8ff`. Nothing here
 * is invented: the theme is the site's dark ground and one blue, with the same
 * glass sheen and liquid motion the Special XiØN Edition established. Glow and
 * accent details live in `styles.css` behind `data-theme="xiondigital-net"` so
 * the theme stays a plain token object like every other entry.
 */
export const XIONDIGITAL_THEME: Theme = {
  id: 'xiondigital-net',
  name: 'xiondigital.net Edition',
  mode: 'dark',
  symbol: 'Xd',
  family: 'custom',
  number: 40,
  plugin: true,
  mark: 'xiondigital',
  gradient: true,
  glass: true,
  tokens: {
    // The site's --bg is a hair above pure black so panels still separate.
    bg: '#050607',
    surface: '#0A0B0D',
    raised: '#101318',
    // #22262E is the site's rgba(255 255 255 / 0.14) hairline resolved onto
    // #050607, nudged one step cooler so the blue sits in the same family.
    line: '#232A35',
    ink: '#ECEDEF',
    muted: '#8B9099',
    accent: '#3F80FF',
    accentSoft: '#79A8FF',
    success: '#46D6A0',
    warning: '#F2C14E',
    danger: '#FF6B7A',
    onAccent: '#020817',
  },
};

export const XIONDIGITAL_PLUGIN = {
  id: 'xiondigital-net',
  name: 'xiondigital.net Edition',
  author: 'XiØN',
  description:
    'The xiondigital.net palette: its near-black ground, one signature blue, a glass sheen, liquid progress and a sharpened X mark in place of the element tile.',
  themeId: XIONDIGITAL_THEME.id,
  markColor: '#3F80FF',
  activatedMessage: 'xiondigital.net Edition engaged. Signature blue.',
} as const;

/**
 * The X as drawn, not typed: a sharp upper-left blade, the upper-right flag,
 * a flared lower-right foot and the long whip tail, with the crossing split by
 * a thin cut so the strokes read as two brush blades rather than one slab.
 * Three flat polygons keep it crisp from 12px in the status bar to 96px in an
 * empty state, and `currentColor` lets the theme's signature blue carry it.
 */
const XIONDIGITAL_X = [
  'M11 2 L25 14 L30 21 L48 44 L60 56 L55 62 L45 61 L38 49 L22 30 L6 14 Z',
  'M36 12 L56 8 L62 13 L58 19 L41 22 L39 27 L33 31 L30 24 Z',
  'M31 33 L37 31 L24 48 L11 61 L6 63 L10 57 L19 47 L27 38 Z',
];

export function XionDigitalMark({
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
      {XIONDIGITAL_X.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </g>
  );

  if (variant === 'tile') {
    return (
      <svg
        className={`xd-mark ${className ?? ''}`}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="xiondigital.net Edition"
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
      className={`xd-mark ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="xiondigital.net Edition"
    >
      {glyph}
    </svg>
  );
}
