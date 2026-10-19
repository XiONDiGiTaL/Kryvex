import { useEffect, type ReactNode } from 'react';
import type { Toast } from '../types';

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
  | 'back'
  | 'forward'
  | 'close'
  | 'check'
  | 'bookmark'
  | 'shield'
  | 'monitor'
  | 'chevron'
  | 'edit'
  | 'command';

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
  command: (
    <>
      <path d="M9 6.5a2.5 2.5 0 1 0-2.5 2.5H9V6.5Z" />
      <path d="M15 6.5A2.5 2.5 0 1 1 17.5 9H15V6.5Z" />
      <path d="M9 17.5A2.5 2.5 0 1 1 6.5 15H9v2.5Z" />
      <path d="M15 17.5a2.5 2.5 0 1 0 2.5-2.5H15v2.5Z" />
      <path d="M9 9h6v6H9z" />
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
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
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
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <KxMark size={64} variant="tile" />
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
