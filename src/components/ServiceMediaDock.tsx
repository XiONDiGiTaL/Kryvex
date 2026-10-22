import { useEffect, useState } from 'react';
import type { Service, ServiceMediaState } from '../types';
import { useT } from '../lib/i18n';
import { formatClock } from '../lib/clock';
import { hostOf } from '../lib/url';
import { serviceForPartition, type MediaAction } from '../lib/media';
import { Icon, ServiceIcon } from './ui';

/**
 * The global transport for audio owned by a service page. It sits above the
 * status bar, so it is reachable from every view without covering the active
 * page's own controls. Collapsing it leaves a compact pill rather than hiding
 * playback completely.
 */
export function ServiceMediaDock({
  entries,
  services,
  onOpenService,
  onControl,
}: {
  entries: ServiceMediaState[];
  services: Service[];
  onOpenService: (service: Service) => void;
  onControl: (id: number, action: MediaAction) => Promise<boolean>;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [pending, setPending] = useState<MediaAction | null>(null);
  const [brokenArt, setBrokenArt] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId !== null && !entries.some(entry => entry.id === selectedId)) {
      setSelectedId(null);
    }
  }, [entries, selectedId]);

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

  return (
    <section
      className={`media-dock ${collapsed ? 'is-collapsed' : ''}`}
      aria-label={t('NOW PLAYING')}
    >
      <span className="media-dock-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>

      <span className="media-dock-art" aria-hidden="true">
        {artwork ? (
          <img
            src={artwork}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBrokenArt(current.artwork)}
          />
        ) : service ? (
          <ServiceIcon service={service} size={34} />
        ) : (
          <span className="media-dock-fallback">
            <Icon name="music" size={16} />
          </span>
        )}
      </span>

      <div className="media-dock-copy">
        <span className="media-dock-kicker mono">
          {service?.name ?? t('NOW PLAYING')}
          {entries.length > 1 ? ` · ${index + 1}/${entries.length}` : ''}
        </span>
        <strong title={title}>{title}</strong>
        {!collapsed ? <span className="media-dock-meta">{subtitle}</span> : null}
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

      {!collapsed ? (
        <span className="media-dock-times mono">
          {formatClock(current.position)}
          {current.duration > 0 ? ` / ${formatClock(current.duration)}` : ''}
        </span>
      ) : null}

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

      <button
        className="media-dock-btn is-quiet"
        onClick={() => setCollapsed(value => !value)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t('Expand media controls') : t('Collapse media controls')}
        title={collapsed ? t('Expand media controls') : t('Collapse media controls')}
      >
        <Icon
          name="chevron"
          size={13}
          className={`media-dock-chevron ${collapsed ? 'is-up' : 'is-down'}`}
        />
      </button>
    </section>
  );
}
