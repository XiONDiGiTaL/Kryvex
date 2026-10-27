import type { CSSProperties } from 'react';

/**
 * Periodic-table tile for Kryvex's own tools.
 *
 * Themes already carry an element number and a two-letter symbol; the secret
 * services use the same language so they read as part of the product rather
 * than as embedded web apps. Numbers continue the fictional Kx series: x529 is
 * the shell itself, x530 Lexium, x531 the player, x532 the 8-bit emulator,
 * x535 the arcade, x536 File Forge and x537 Canvas.
 *
 * The emulator is the one mark whose symbol is a word rather than two letters.
 * Its old pixel screen becomes a watermark inside the tile, so all three
 * services share one silhouette while the emulator still looks like hardware.
 */
export type ToolMark =
  | 'lexium'
  | 'player'
  | 'emulator'
  | 'disk'
  | 'link'
  | 'arcade'
  | 'forge'
  | 'canvas';

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
  disk: { number: 'x533', symbol: 'Dx', name: 'Disk pulse', caption: 'Disk' },
  link: { number: 'x534', symbol: 'Lk', name: 'Kryvex Link', caption: 'Link' },
  arcade: { number: 'x535', symbol: 'Ar', name: 'Arcade' },
  forge: { number: 'x536', symbol: 'Ff', name: 'File Forge', caption: 'Files' },
  canvas: { number: 'x537', symbol: 'Cv', name: 'Canvas' },
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
  if (tool === 'link') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="4.5" width="12" height="9" rx="1.6" />
        <rect x="15.5" y="11" width="6.5" height="9" rx="1.6" />
        <path d="M14.5 9.6h1.4M17.6 14.6h1.2" />
      </svg>
    );
  }
  if (tool === 'disk') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="7" rx="2" />
        <rect x="3" y="13" width="18" height="6.5" rx="2" />
        <circle cx="17.4" cy="8" r="0.9" />
        <path d="M6 16.4h4l1.6-3 2 5.4 1.8-3.2H18" />
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
  if (tool === 'arcade') {
    // A cabinet seen from the front: marquee, screen, joystick and two buttons.
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.2" y="2.6" width="15.6" height="18.8" rx="2.2" />
        <path d="M4.2 6.4h15.6" />
        <rect x="7" y="8.4" width="10" height="6.2" rx="1" />
        <path d="M9.6 16.6v2.2" />
        <circle cx="9.6" cy="18.9" r="1.1" />
        <circle cx="14.2" cy="17.4" r="1" />
        <circle cx="16.6" cy="18.9" r="1" />
      </svg>
    );
  }
  if (tool === 'forge') {
    // Two sheets with an arrow between them: a file going in, a copy coming out.
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.4 5.6h7.2v12.8H3.4z" />
        <path d="M13.4 5.6h7.2v12.8h-7.2z" />
        <path d="M11 12h2" />
        <path d="M12.2 10.4 13.8 12l-1.6 1.6" />
        <path d="M5.6 9.2h3.2M5.6 12h3.2" />
      </svg>
    );
  }
  if (tool === 'canvas') {
    // A brush over a painted stroke, inside a frame.
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4.4" width="18" height="15.2" rx="2.2" />
        <path d="M6.6 15.8c1.8-3.4 3.6-5.4 5.4-6l1.4 1.4c-.6 1.8-2.6 3.6-6 5.4" />
        <path d="M14.8 7.4l2.4 2.4" />
        <path d="M17.6 6.6l-1 2.2-2.2 1" />
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
