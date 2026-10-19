import type { Theme } from '../lib/themes';

/**
 * Special Donkey Edition — the first Kryvex theme plugin.
 *
 * It is intentionally self-contained: a theme definition plus the brand mark
 * it asks the shell to use. No colours are duplicated in CSS; the normal token
 * pipeline applies them like any built-in theme.
 */
export const SPECIAL_DONKEY_THEME: Theme = {
  id: 'special-donkey',
  name: 'Special Donkey Edition',
  mode: 'dark',
  plugin: true,
  mark: 'donkey',
  tokens: {
    bg: '#070605',
    surface: '#0D0B07',
    raised: '#171208',
    line: '#3B2E12',
    ink: '#F6E7B4',
    muted: '#B39A5C',
    accent: '#F2C94C',
    accentSoft: '#FFE08A',
    success: '#D4AF37',
    warning: '#E0A93B',
    danger: '#C4683F',
  },
};

export const DONKEY_PLUGIN = {
  id: 'special-donkey',
  name: 'Special Donkey Edition',
  author: 'Kryvex',
  description:
    'An all-black, gold-outlined theme with a hand-drawn donkey mark in place of the element tile.',
  themeId: SPECIAL_DONKEY_THEME.id,
} as const;

/**
 * Gold line-art donkey. Long ears, long face, minimal strokes — it has to read
 * at 16px in the title bar as well as at 96px in an empty state.
 */
export function DonkeyMark({
  size = 24,
  variant = 'solid',
  className,
}: {
  size?: number;
  variant?: 'solid' | 'tile';
  className?: string;
}) {
  const glyph = (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* long donkey ears, in profile */}
      <path d="M44 22C41 14 40 5 43 3c4 1 5 9 6 16" />
      <path d="M50 22c1-9 5-16 8-15 2 4-1 12-5 16" />
      <path d="M44.5 8c.8 3.4 1.2 6.8 1.3 9.8" />
      <path d="M51.7 10c-.5 2.5-1.4 4.8-2.6 6.6" />
      {/* neck and mane */}
      <path d="M45 59c0-8 2-16 6-22 3-5 2-12-2-16" />
      <path d="M51 27l3 2M52 33l3 2M52 39l3 2M50 45l2 2" />
      {/* long face, blunt muzzle */}
      <path d="M47 21c-7 1-12 5-17 10-5 5-12 6-17 9-5 2-5 7-1 9 5 2 12 1 18-1 5-2 10-2 14 1 3 2 3 6 1 9-2 2-6 2-10 1" />
      <path d="M41 57c2 1 3 2 4 2" />
      {/* eye, nostril and mouth */}
      <circle cx="33.5" cy="33.5" r="1.8" fill="currentColor" />
      <circle cx="11.6" cy="44" r="0.9" fill="currentColor" />
      <path d="M10.5 47.5c3 1.5 6.5 1.5 9.5 0" />
      <path d="M31 39.5c-1 3-4 4.5-7 5" />
    </g>
  );

  if (variant === 'tile') {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="Special Donkey Edition"
      >
        <rect x="1.2" y="1.2" width="61.6" height="61.6" rx="12" fill="currentColor" opacity="0.05" />
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
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Special Donkey Edition"
    >
      {glyph}
    </svg>
  );
}
