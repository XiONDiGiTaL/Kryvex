import { useEffect, useState, type ReactNode } from 'react';
import type { Service, Toast } from '../types';
import { BRAND_ICONS } from '../lib/brand-icons';
import { useT } from '../lib/i18n';
import { DonkeyMark } from '../plugins/donkey';
import { XionMark } from '../plugins/xion';

type IconName =
  | 'home'
  | 'layers'
  | 'globe'
  | 'sliders'
  | 'search'
  | 'plus'
  | 'pin'
  | 'external'
  | 'trash'
  | 'reload'
  | 'bell'
  | 'back'
  | 'forward'
  | 'close'
  | 'check'
  | 'bookmark'
  | 'shield'
  | 'monitor'
  | 'chevron'
  | 'edit'
  | 'help'
  | 'command'
  | 'download'
  | 'folder'
  | 'lock'
  | 'history'
  | 'image'
  | 'spark'
  | 'users'
  | 'warning'
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'repeat'
  | 'repeat-one'
  | 'shuffle'
  | 'volume'
  | 'mute'
  | 'mic'
  | 'language'
  | 'copy'
  | 'upload'
  | 'music'
  | 'incognito'
  | 'rss'
  | 'menu'
  | 'heart'
  | 'note'
  | 'droplet'
  | 'moon';

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M5.8 9.6V20h12.4V9.6" />
      <path d="M9.7 20v-5.4h4.6V20" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.7L12 12.4 3.5 7.7 12 3Z" />
      <path d="m3.5 12.2 8.5 4.7 8.5-4.7" />
      <path d="m3.5 16.5 8.5 4.7 8.5-4.7" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.6 12h16.8" />
      <path d="M12 3.4c2.3 2.4 3.5 5.4 3.5 8.6S14.3 18.2 12 20.6C9.7 18.2 8.5 15.2 8.5 12S9.7 5.8 12 3.4Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.4" />
      <path d="m16 16 4.3 4.3" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  pin: (
    <>
      <path d="M9 4h6l-.8 5.4 3.3 3.1H6.5l3.3-3.1L9 4Z" />
      <path d="M12 12.5V20" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="m20 4-8.5 8.5" />
      <path d="M18 14v5.5H4.5V6H10" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9 7V4.8h6V7" />
      <path d="M6.5 7l.9 12.2h9.2L17.5 7" />
      <path d="M10.3 10.5v5.6M13.7 10.5v5.6" />
    </>
  ),
  reload: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V10h-5.4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 15.6H6l1.4-2.3V9.1a4.6 4.6 0 0 1 9.2 0v4.2l1.4 2.3Z" />
      <path d="M9.8 18.4a2.2 2.2 0 0 0 4.4 0" />
    </>
  ),
  back: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  forward: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  check: <path d="m5 12.5 4.6 4.6L19 7.4" />,
  bookmark: <path d="M6.5 4h11v16.5L12 16.3l-5.5 4.2V4Z" />,
  shield: (
    <>
      <path d="M12 3.4 19 6v6c0 4.2-2.9 7.5-7 8.8-4.1-1.3-7-4.6-7-8.8V6l7-2.6Z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </>
  ),
  monitor: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11.5" rx="1.6" />
      <path d="M9 20h6" />
      <path d="M12 16v4" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  edit: (
    <>
      <path d="M15.2 4.3 19.7 8.8 8.8 19.7H4.3v-4.5L15.2 4.3Z" />
      <path d="m13.4 6.1 4.5 4.5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.7 9.2a2.4 2.4 0 1 1 3.5 2.2c-.8.4-1.2 1-1.2 1.8" />
      <path d="M12 16.9h.01" />
    </>
  ),
  command: (
    <>
      <path d="M9 6.5a2.5 2.5 0 1 0-2.5 2.5H9V6.5Z" />
      <path d="M15 6.5A2.5 2.5 0 1 1 17.5 9H15V6.5Z" />
      <path d="M9 17.5A2.5 2.5 0 1 1 6.5 15H9v2.5Z" />
      <path d="M15 17.5a2.5 2.5 0 1 0 2.5-2.5H15v2.5Z" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 20h15" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 6.5h6l2 2h9v11h-17z" />
      <path d="M3.5 10.5h17" />
    </>
  ),
  history: (
    <>
      <path d="M4 5v5h5" />
      <path d="M5.2 9.2A7.5 7.5 0 1 1 4.7 14" />
      <path d="M12 8v4.3l3 1.8" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.2" width="14" height="9.8" rx="2" />
      <path d="M8.6 10.2V7.7a3.4 3.4 0 0 1 6.8 0v2.5" />
      <path d="M12 13.8v2.6" />
    </>
  ),
  image: (
    <>
      <rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2" />
      <circle cx="9" cy="9.6" r="1.6" />
      <path d="m4.4 17.2 4.6-4.4 3.6 3.4 2.6-2.4 4.4 4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.4" r="3.2" />
      <path d="M3.2 19.4c.5-3.2 2.9-5 5.8-5s5.3 1.8 5.8 5" />
      <path d="M15.6 5.6a3 3 0 0 1 0 5.7" />
      <path d="M17.6 14.7c1.7.6 2.9 2.1 3.2 4.2" />
    </>
  ),
  spark: (
    <>
      <path d="M11.2 3.6c.7 4.2 2 5.5 6.2 6.2-4.2.7-5.5 2-6.2 6.2-.7-4.2-2-5.5-6.2-6.2 4.2-.7 5.5-2 6.2-6.2Z" />
      <path d="M17.6 14.4c.4 2.1 1 2.7 3.1 3.1-2.1.4-2.7 1-3.1 3.1-.4-2.1-1-2.7-3.1-3.1 2.1-.4 2.7-1 3.1-3.1Z" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.4 21 19.6H3z" />
      <path d="M12 9.6v4.6" />
      <circle cx="12" cy="17" r="0.9" />
    </>
  ),
  play: <path d="M8 5.4v13.2L19 12 8 5.4Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  next: (
    <>
      <path d="M6 5.6v12.8L15 12 6 5.6Z" fill="currentColor" stroke="none" />
      <path d="M18.4 5v14" />
    </>
  ),
  prev: (
    <>
      <path d="M18 5.6v12.8L9 12l9-6.4Z" fill="currentColor" stroke="none" />
      <path d="M5.6 5v14" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 9.4A4.4 4.4 0 0 1 8.4 5h9.2" />
      <path d="m15 2.6 2.6 2.4L15 7.4" />
      <path d="M20 14.6A4.4 4.4 0 0 1 15.6 19H6.4" />
      <path d="m9 21.4-2.6-2.4L9 16.6" />
    </>
  ),
  'repeat-one': (
    <>
      <path d="M4 9.4A4.4 4.4 0 0 1 8.4 5h9.2" />
      <path d="m15 2.6 2.6 2.4L15 7.4" />
      <path d="M20 14.6A4.4 4.4 0 0 1 15.6 19H6.4" />
      <path d="m9 21.4-2.6-2.4L9 16.6" />
      <path d="M12 9.6v5" />
      <path d="m10.8 10.6 1.2-.9" />
    </>
  ),
  shuffle: (
    <>
      <path d="M3.5 6.5h3.1c1.6 0 2.6.8 3.6 2.1l3.6 4.8c1 1.3 2 2.1 3.6 2.1h3.1" />
      <path d="m18 2.9 3 3.6-3 3.6" />
      <path d="M3.5 17.5h3.1c1.6 0 2.6-.8 3.6-2.1l.8-1.1" />
      <path d="m14 10.6.8-1.1c1-1.3 2-2.1 3.6-2.1h2.1" />
      <path d="m18 13.9 3 3.6-3 3.6" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.4h3.3L12 5.6v12.8L7.3 14.6H4z" />
      <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
      <path d="M17.8 6.6a7.4 7.4 0 0 1 0 10.8" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.4h3.3L12 5.6v12.8L7.3 14.6H4z" />
      <path d="m16 9.6 4.4 4.8" />
      <path d="m20.4 9.6-4.4 4.8" />
    </>
  ),
  mic: (
    <>
      <rect x="9.2" y="3" width="5.6" height="10.4" rx="2.8" />
      <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0" />
      <path d="M12 17.8V21" />
      <path d="M9 21h6" />
    </>
  ),
  language: (
    <>
      <path d="m3.4 19 4.8-13 4.8 13" />
      <path d="M5.4 14.2h5.6" />
      <path d="M15 19h5.6" />
      <path d="M17.8 19c0-3.1 1-5.6 2.8-7.4" />
    </>
  ),
  copy: (
    <>
      <rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2.2" />
      <path d="M15.6 8.4V6.2A2.2 2.2 0 0 0 13.4 4H6.2A2.2 2.2 0 0 0 4 6.2v7.2a2.2 2.2 0 0 0 2.2 2.2h2.2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4.6" />
      <path d="m7.4 9.2 4.6-4.6 4.6 4.6" />
      <path d="M4.5 16.4v1.8A2.3 2.3 0 0 0 6.8 20.5h10.4a2.3 2.3 0 0 0 2.3-2.3v-1.8" />
    </>
  ),
  incognito: (
    <>
      <path d="M4.2 10.5 6 6.3h12l1.8 4.2" />
      <path d="M3 10.5h18" />
      <path d="M7.2 10.5a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z" />
      <path d="M16.8 10.5a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z" />
      <path d="M10.5 13.8h3" />
    </>
  ),
  rss: (
    <>
      <path d="M5 18.5h.01" />
      <path d="M5 13.2a5.8 5.8 0 0 1 5.8 5.8" />
      <path d="M5 7.4a11.6 11.6 0 0 1 11.6 11.6" />
    </>
  ),
  menu: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
  music: (
    <>
      <path d="M9 18.2V6.4l9-2v11.4" />
      <circle cx="6.6" cy="18.4" r="2.4" />
      <circle cx="15.6" cy="16.6" r="2.4" />
    </>
  ),
  heart: (
    <path d="M12 20.2S4 15.5 4 9.9A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.6-8 10.3-8 10.3Z" />
  ),
  note: (
    <>
      <path d="M5.5 4.5h13v9.8l-4.2 4.2H5.5Z" />
      <path d="M14.3 18.5v-4.2h4.2" />
      <path d="M8.5 8.6h7M8.5 11.8h4.4" />
    </>
  ),
  droplet: (
    <path d="M12 3.6c3.2 3.3 5.6 6.1 5.6 9.1a5.6 5.6 0 0 1-11.2 0c0-3 2.4-5.8 5.6-9.1Z" />
  ),
  moon: (
    <>
      <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.4 8.4 0 1 0 10.5 10.5Z" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The element symbol, drawn (not typed) so it is identical everywhere. */
export function KxMark({ size = 22, variant = 'solid' }: { size?: number; variant?: 'solid' | 'tile' }) {
  const glyph = (
    <g fill="none" stroke="currentColor" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round">
      <path d="M148 164V328" />
      <path d="M240 164L168 246" />
      <path d="M174 246L242 328" />
      <path d="M286 204L362 328" />
      <path d="M362 204L286 328" />
    </g>
  );

  if (variant === 'solid') {
    return (
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
        {glyph}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Kryvex">
      <rect x="4" y="4" width="504" height="504" rx="88" fill="currentColor" opacity="0.06" />
      <rect x="4" y="4" width="504" height="504" rx="88" fill="none" stroke="currentColor" strokeWidth="10" opacity="0.35" />
      {glyph}
    </svg>
  );
}

export type ThemeMarkKind = 'kx' | 'donkey' | 'xion';

/** The shell's brand mark follows the active theme (donkey for the plugin). */
export function ThemeMark({
  mark = 'kx',
  size = 22,
  variant = 'solid',
}: {
  mark?: ThemeMarkKind;
  size?: number;
  variant?: 'solid' | 'tile';
}) {
  if (mark === 'donkey') return <DonkeyMark size={size} variant={variant} />;
  if (mark === 'xion') return <XionMark size={size} variant={variant} />;
  return <KxMark size={size} variant={variant} />;
}

/**
 * Brand glyph when we know the mark, a direct favicon request to the service
 * itself when we do not, and the letter tile as the final fallback.
 */
export function ServiceIcon({
  service,
  size = 38,
  className,
}: {
  service: Pick<Service, 'url' | 'icon' | 'letter' | 'color'>;
  size?: number;
  className?: string;
}) {
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    setFaviconFailed(false);
  }, [service.url, service.icon]);

  const brand = service.icon ? BRAND_ICONS[service.icon] : undefined;
  if (brand) {
    return (
      <span
        className={`service-glyph brand-glyph ${className ?? ''}`}
        style={{
          width: size,
          height: size,
          color: service.color,
          background: `color-mix(in srgb, ${service.color} 16%, transparent)`,
          borderColor: `color-mix(in srgb, ${service.color} 32%, transparent)`,
        }}
        title={brand.title}
      >
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.54)} height={Math.round(size * 0.54)} aria-hidden="true">
          <path d={brand.path} fill="currentColor" />
        </svg>
      </span>
    );
  }

  let favicon = '';
  try {
    favicon = `${new URL(service.url).origin}/favicon.ico`;
  } catch {
    favicon = '';
  }

  if (favicon && !faviconFailed) {
    return (
      <span
        className={`service-glyph favicon-glyph ${className ?? ''}`}
        style={{
          width: size,
          height: size,
          color: service.color,
          background: `color-mix(in srgb, ${service.color} 12%, transparent)`,
          borderColor: `color-mix(in srgb, ${service.color} 28%, transparent)`,
        }}
      >
        <img
          src={favicon}
          alt=""
          width={Math.round(size * 0.6)}
          height={Math.round(size * 0.6)}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFaviconFailed(true)}
        />
      </span>
    );
  }

  return <ServiceGlyph letter={service.letter} color={service.color} size={size} />;
}

export function ServiceGlyph({
  letter,
  color,
  size = 38,
}: {
  letter: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="service-glyph"
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

export function Modal({
  title,
  subtitle,
  width = 520,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('Close dialog')}>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  mark = 'kx',
}: {
  title: string;
  body: string;
  action?: ReactNode;
  mark?: ThemeMarkKind;
}) {
  return (
    <div className="empty-state">
      <ThemeMark mark={mark} size={64} variant="tile" />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ToastHost({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-dot" aria-hidden="true" />
          {toast.message}
        </div>
      ))}
    </div>
  );
}
