import { useEffect, useRef, useState } from 'react';
import type { Service, ServiceMediaState } from '../types';
import { useT } from '../lib/i18n';
import { formatClock } from '../lib/clock';
import { hostOf } from '../lib/url';
import { serviceForPartition, type MediaAction } from '../lib/media';
import { Icon, ServiceIcon } from './ui';

/** After this much time without pointer or focus, the strip fades away. */
const IDLE_AFTER_MS = 4200;
/** Pointer distance from the bottom edge that brings the strip back. */
const EDGE_REVEAL_PX = 96;
/** How long a bottom-edge approach keeps the strip awake without more moves. */
const EDGE_HOLD_MS = 1200;

/**
 * The global transport for audio owned by a service page. At rest it is a
 * compact strip inside the status bar; hovering it, or pinning it with the
 * chevron, reveals the full island just above the bar. After a few idle
 * seconds the strip fades to nothing, and approaching the bottom edge brings
 * it back. The workspace stays uncovered while another app is in use, and the
 * controls are still one hover away from every view.
 */
export function ServiceMediaDock({
  entries,
  services,
  onOpenService,
  onControl,
  variant = 'status',
}: {
  entries: ServiceMediaState[];
  services: Service[];
  onOpenService: (service: Service) => void;
  onControl: (id: number, action: MediaAction) => Promise<boolean>;
  /** The floating layout is only a fallback when the status bar is hidden. */
  variant?: 'status' | 'floating';
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pending, setPending] = useState<MediaAction | null>(null);
  const [brokenArt, setBrokenArt] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const [nearEdge, setNearEdge] = useState(false);
  const [focused, setFocused] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const edgeTimer = useRef<number | undefined>(undefined);
  const open = hovered || pinned;

  // The status bar is only a few pixels tall, so watch a band above the bottom
  // edge instead of the strip itself. This also works while the strip is faded
  // out and no longer accepts pointer events.
  useEffect(() => {
    if (variant !== 'status') return;
    const onPointerMove = (event: PointerEvent) => {
      const near = event.clientY >= window.innerHeight - EDGE_REVEAL_PX;
      window.clearTimeout(edgeTimer.current);
      edgeTimer.current = undefined;
      if (!near) {
        setNearEdge(false);
        return;
      }
      setNearEdge(true);
      setIdle(false);
      // A service webview swallows the pointer moves that happen above it, so
      // release the hold on a timer instead of waiting for a move that may
      // never reach the host. Moving along the edge keeps resetting this.
      edgeTimer.current = window.setTimeout(() => {
        edgeTimer.current = undefined;
        setNearEdge(false);
      }, EDGE_HOLD_MS);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.clearTimeout(edgeTimer.current);
      edgeTimer.current = undefined;
    };
  }, [variant]);

  useEffect(() => {
    if (variant !== 'status' || open || nearEdge || focused) {
      setIdle(false);
      return;
    }
    const timer = window.setTimeout(() => {
      // Never fade the strip out from under the keyboard focus.
      if (slotRef.current?.contains(document.activeElement)) return;
      setIdle(true);
    }, IDLE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [variant, open, nearEdge, focused]);

  useEffect(() => {
    if (selectedId !== null && !entries.some(entry => entry.id === selectedId)) {
      setSelectedId(null);
    }
  }, [entries, selectedId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPinned(false);
      setHovered(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const current = entries.find(entry => entry.id === selectedId) ?? entries[0];
  if (!current) return null;
  const index = entries.indexOf(current);

  const service = serviceForPartition(services, current.partition);
  const title = current.title || current.artist || hostOf(current.url) || t('Media');
  const subtitle =
    current.artist ||
    (service ? t('Playing in {name}', { name: service.name }) : t('NOW PLAYING'));
  const progress =
    current.duration > 0
      ? Math.max(0, Math.min(100, (current.position / current.duration) * 100))
      : 0;
  const artwork = current.artwork && current.artwork !== brokenArt ? current.artwork : '';

  async function send(action: MediaAction) {
    if (pending || !current) return;
    setPending(action);
    try {
      await onControl(current.id, action);
    } finally {
      setPending(null);
    }
  }

  const art = (size: number) => {
    return artwork ? (
      <img
        src={artwork}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBrokenArt(current.artwork)}
      />
    ) : service ? (
      <ServiceIcon service={service} size={size} />
    ) : (
      <span className="media-dock-fallback">
        <Icon name="music" size={Math.max(12, size - 2)} />
      </span>
    );
  };

  const panel = (
    <section
      className={`media-dock ${variant === 'floating' ? 'is-floating' : ''}`}
      aria-label={t('NOW PLAYING')}
    >
      <span className="media-dock-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>

      <span className="media-dock-art" aria-hidden="true">
        {art(34)}
      </span>

      <div className="media-dock-copy">
        <span className="media-dock-kicker mono">
          {service?.name ?? t('NOW PLAYING')}
          {entries.length > 1 ? ` · ${index + 1}/${entries.length}` : ''}
        </span>
        <strong title={title}>{title}</strong>
        <span className="media-dock-meta">{subtitle}</span>
      </div>

      <div className="media-dock-controls">
        <button
          className="media-dock-btn"
          onClick={() => void send('previous')}
          disabled={Boolean(pending)}
          aria-label={t('Previous track')}
          title={t('Previous')}
        >
          <Icon name="prev" size={16} />
        </button>
        <button
          className="media-dock-btn is-primary"
          onClick={() => void send(current.playing ? 'pause' : 'play')}
          disabled={Boolean(pending)}
          aria-label={current.playing ? t('Pause') : t('Play')}
          title={current.playing ? t('Pause') : t('Play')}
        >
          <Icon name={current.playing ? 'pause' : 'play'} size={17} />
        </button>
        <button
          className="media-dock-btn"
          onClick={() => void send('next')}
          disabled={Boolean(pending)}
          aria-label={t('Next track')}
          title={t('Next')}
        >
          <Icon name="next" size={16} />
        </button>
      </div>

      <span className="media-dock-times mono">
        {formatClock(current.position)}
        {current.duration > 0 ? ` / ${formatClock(current.duration)}` : ''}
      </span>

      {entries.length > 1 ? (
        <button
          className="media-dock-btn is-quiet"
          onClick={() => {
            const next = entries[(index + 1) % entries.length];
            if (next) setSelectedId(next.id);
          }}
          aria-label={t('Switch media source')}
          title={t('Switch media source')}
        >
          <Icon name="layers" size={14} />
        </button>
      ) : null}

      {service ? (
        <button
          className="media-dock-btn is-quiet"
          onClick={() => onOpenService(service)}
          aria-label={t('Open {name}', { name: service.name })}
          title={t('Open {name}', { name: service.name })}
        >
          <Icon name="external" size={14} />
        </button>
      ) : null}

      {variant === 'status' ? (
        <button
          className="media-dock-btn is-quiet"
          onClick={() => {
            setPinned(false);
            setHovered(false);
          }}
          aria-label={t('Collapse media controls')}
          title={t('Collapse media controls')}
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
    </section>
  );

  if (variant === 'floating') return panel;

  return (
    <div
      ref={slotRef}
      className={`media-dock-slot ${open ? 'is-open' : ''} ${idle ? 'is-idle' : ''}`}
      onPointerEnter={() => setIdle(false)}
      onFocusCapture={() => {
        setFocused(true);
        setIdle(false);
      }}
      onBlurCapture={() => setFocused(false)}
    >
      <div
        className="media-dock-inline"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className="media-dock-inline-art" aria-hidden="true">
          {art(14)}
        </span>

        <button
          className="media-dock-inline-copy"
          onClick={() => {
            if (service) onOpenService(service);
          }}
          aria-label={service ? t('Open {name}', { name: service.name }) : title}
          title={title}
        >
          <span className="media-dock-inline-kicker mono">
            {service?.name ?? t('NOW PLAYING')}
            {entries.length > 1 ? ` · ${index + 1}/${entries.length}` : ''}
          </span>
          <strong>{title}</strong>
        </button>

        <span className="media-dock-inline-time mono">
          {formatClock(current.position)}
          {current.duration > 0 ? ` / ${formatClock(current.duration)}` : ''}
        </span>

        <button
          className="media-dock-inline-btn is-primary"
          onClick={() => void send(current.playing ? 'pause' : 'play')}
          disabled={Boolean(pending)}
          aria-label={current.playing ? t('Pause') : t('Play')}
          title={current.playing ? t('Pause') : t('Play')}
        >
          <Icon name={current.playing ? 'pause' : 'play'} size={12} />
        </button>

        <button
          className="media-dock-inline-btn"
          onClick={() => {
            if (open) {
              setPinned(false);
              setHovered(false);
            } else {
              setPinned(true);
            }
          }}
          aria-expanded={open}
          aria-label={open ? t('Collapse media controls') : t('Expand media controls')}
          title={open ? t('Collapse media controls') : t('Expand media controls')}
        >
          <Icon
            name="chevron"
            size={11}
            className={`media-dock-chevron ${open ? 'is-down' : 'is-up'}`}
          />
        </button>

        <span className="media-dock-inline-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>

        {open ? panel : null}
      </div>
    </div>
  );
}
