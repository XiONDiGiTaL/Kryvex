import type { Theme } from '../lib/themes';
import xMarkUrl from '../assets/x-mark.png';

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
    // #232A35 is the site's rgba(255 255 255 / 0.14) hairline resolved onto
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
    "The xiondigital.net palette: its near-black ground, one signature blue, a glass sheen, liquid progress and the site's own X mark in place of the element tile.",
  themeId: XIONDIGITAL_THEME.id,
  markColor: '#3F80FF',
  activatedMessage: 'xiondigital.net Edition engaged. Signature blue.',
} as const;

/**
 * The creator's X, not a redrawn approximation.
 *
 * `src/assets/x-mark.png` is the site's own `images/x-mark.png`, trimmed of its
 * empty margin and downscaled to 320px of alpha. The file stays colour-neutral
 * (white pixels, original alpha) and the shell paints it through a CSS mask,
 * so `currentColor` fills it: the expanded blue under this theme, each theme's
 * own accent anywhere else, and no per-colour duplicates of the artwork.
 */
export function XionDigitalMark({
  size = 24,
  variant = 'solid',
  className,
}: {
  size?: number;
  variant?: 'solid' | 'tile';
  className?: string;
}) {
  const glyph = Math.round(variant === 'tile' ? size * 0.62 : size);
  return (
    <span
      className={`xd-mark ${variant === 'tile' ? 'is-tile' : ''} ${className ?? ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="xiondigital.net Edition"
    >
      <span
        className="xd-mark-glyph"
        style={{
          width: glyph,
          height: glyph,
          WebkitMaskImage: `url(${xMarkUrl})`,
          maskImage: `url(${xMarkUrl})`,
        }}
      />
    </span>
  );
}
