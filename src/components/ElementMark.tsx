import type { CSSProperties } from 'react';

/**
 * Periodic-table tile for Kryvex's own tools.
 *
 * Themes already carry an element number and a two-letter symbol; the secret
 * services use the same language so they read as part of the product rather
 * than as embedded web apps. Numbers continue the fictional Kx series: x529 is
 * the shell itself, x530 Lexium, x531 the player, x532 the 8-bit emulator.
 *
 * The emulator is the one mark whose symbol is a word rather than two letters.
 * Its old pixel screen becomes a watermark inside the tile, so all three
 * services share one silhouette while the emulator still looks like hardware.
 */
export type ToolMark = 'lexium' | 'player' | 'emulator';

type Mark = {
  number: string;
  symbol: string;
  /** The accessible name; also the caption unless `caption` overrides it. */
  name: string;
  caption?: string;
};

const MARKS: Record<ToolMark, Mark> = {
  lexium: { number: 'x530', symbol: 'Lx', name: 'Lexium' },
  player: { number: 'x531', symbol: 'Mx', name: 'Media' },
  // "Emulator" does not fit a 58 px card tile, so the visible caption is the
  // shorter word the emulator is known by; the accessible name keeps the noun.
  emulator: { number: 'x532', symbol: '8-bit', name: 'Emulator', caption: 'Retro' },
};

function Glyph({ tool }: { tool: ToolMark }) {
  if (tool === 'lexium') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.2" />
        <path d="M3.8 12h16.4" />
        <path d="M12 3.8c2.2 2.3 3.4 5.1 3.4 8.2S14.2 17.9 12 20.2C9.8 17.9 8.6 15.1 8.6 12S9.8 6.1 12 3.8Z" />
        <path d="M5.4 6.6c1.7 1.1 4.1 1.7 6.6 1.7s4.9-.6 6.6-1.7" />
      </svg>
    );
  }
  if (tool === 'emulator') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.4 7.6H6.2A3.2 3.2 0 0 0 3 10.8v2.9a3.1 3.1 0 0 0 3.2 3.1h1.7l1.2 1.6h4.4l1.2-1.6h1.7a3.1 3.1 0 0 0 3.2-3.1v-2.9a3.2 3.2 0 0 0-3.2-3.2Z" />
        <path d="M7 10.4v3.4M5.3 12.1h3.4" />
        <circle cx="16" cy="10.9" r="1" />
        <circle cx="18.3" cy="13.2" r="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 14.4V9.6" />
      <path d="M8 17.4V6.6" />
      <path d="M12 20V4" />
      <path d="M16 16.2V7.8" />
      <path d="M20 13.4V10.6" />
    </svg>
  );
}

export function ElementMark({
  tool,
  size = 72,
  compact = false,
  className,
}: {
  tool: ToolMark;
  size?: number;
  /** Drops the caption; used in dense lists and the transport bar. */
  compact?: boolean;
  className?: string;
}) {
  const mark = MARKS[tool];
  const wide = mark.symbol.length > 3;
  const caption = `[ ${mark.caption ?? mark.name} ]`;
  // A caption longer than "[ Emulator ]" would ellipsize in a card tile, so it
  // drops one size step instead of losing its last letters.
  const longCaption = caption.length > 12;
  return (
    <span
      className={`element-tile tool-${tool} ${compact ? 'is-compact' : ''} ${className ?? ''}`}
      style={{ '--tile-size': `${size}px` } as CSSProperties}
      role="img"
      aria-label={`${mark.name} · element ${mark.number} · ${mark.symbol}`}
    >
      {tool === 'emulator' ? (
        <span className="element-tile-mosaic" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} />
          ))}
        </span>
      ) : null}
      <span className="element-tile-top">
        <span className="element-tile-number mono">{mark.number}</span>
        <span className="element-tile-glyph">
          <Glyph tool={tool} />
        </span>
      </span>
      <span className={`element-tile-symbol mono ${wide ? 'is-wide' : ''}`}>{mark.symbol}</span>
      {compact ? null : (
        <span className={`element-tile-name mono ${longCaption ? 'is-long' : ''}`}>{caption}</span>
      )}
    </span>
  );
}
