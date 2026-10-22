import { useMemo, useState } from 'react';
import type { PersistedState, Service, ServiceCategory } from '../types';
import { CATEGORIES, SERVICE_COLORS } from '../lib/services';
import { useT } from '../lib/i18n';
import { hostOf } from '../lib/url';
import { EmptyState, Icon, ServiceIcon } from '../components/ui';
import { ServiceQuickMenu } from '../components/ServiceQuickMenu';
import { ElementMark } from '../components/ElementMark';

export function Services({
  state,
  onOpen,
  onEdit,
  onAdd,
  onTogglePin,
  onDelete,
  onUpdateService,
  onSecretTool,
}: {
  state: PersistedState;
  onOpen: (service: Service) => void;
  onEdit: (service: Service) => void;
  onAdd: () => void;
  onTogglePin: (service: Service) => void;
  onDelete: (service: Service) => void;
  onUpdateService: (service: Service, patch: Partial<Service>) => void;
  onSecretTool: (tool: 'emulator' | 'lexium' | 'player') => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | ServiceCategory>('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.services
      .filter(service => (filter === 'all' ? true : service.category === filter))
      .filter(service =>
        q ? `${service.name} ${service.url}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  }, [state.services, filter, query]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const service of state.services) {
      map.set(service.category, (map.get(service.category) ?? 0) + 1);
    }
    return map;
  }, [state.services]);

  return (
    <section className="view services-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">
            {t('MODULE REGISTRY / {count} INSTALLED', { count: state.services.length })}
          </p>
          <h1>{t('Services')}</h1>
          <p className="lede">
            {t(
              'Every entry is a module with its own URL, category and isolated session. Add anything that runs in a browser.',
            )}
          </p>
        </div>
        <button className="btn primary" onClick={onAdd}>
          <Icon name="plus" size={16} />
          {t('Add service')}
        </button>
      </header>

      <div className="toolbar">
        <label className="search-field">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('Filter by name or host')}
            aria-label={t('Filter services')}
          />
          {query ? (
            <button className="icon-btn tiny" onClick={() => setQuery('')} aria-label={t('Clear filter')}>
              <Icon name="close" size={13} />
            </button>
          ) : null}
        </label>

        <div className="filter-chips" role="tablist" aria-label={t('Filter by category')}>
          <button
            role="tab"
            aria-selected={filter === 'all'}
            className={`chip-btn ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('All')} <span className="mono">{state.services.length}</span>
          </button>
          {CATEGORIES.map(category => (
            <button
              key={category.id}
              role="tab"
              aria-selected={filter === category.id}
              className={`chip-btn ${filter === category.id ? 'is-active' : ''}`}
              onClick={() => setFilter(category.id)}
            >
              {t(category.label)} <span className="mono">{counts.get(category.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            state.services.length === 0 ? t('No modules installed') : t('Nothing matches that filter')
          }
          body={
            state.services.length === 0
              ? t(
                  'Add a web app by URL — it gets its own persistent, isolated session and a permanent home here.',
                )
              : t('Try another search term or switch back to the All filter.')
          }
          action={
            state.services.length === 0 ? (
              <button className="btn primary" onClick={onAdd}>
                {t('Add your first service')}
              </button>
            ) : (
              <button
                className="btn secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                {t('Clear filters')}
              </button>
            )
          }
        />
      ) : (
        <div className="service-grid">
          {visible.map(service => (
            <article
              key={service.id}
              className="service-card"
              tabIndex={0}
              role="button"
              aria-label={t('Open {name}', { name: service.name })}
              onClick={() => onOpen(service)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen(service);
                }
              }}
              style={{ '--service-color': service.color } as React.CSSProperties}
            >
              <div className="service-card-head">
                <ServiceIcon service={service} size={40} />
                <div className="service-card-actions">
                  <ServiceQuickMenu
                    service={service}
                    notificationsGloballyOn={state.settings.serviceNotifications}
                    onChange={patch => onUpdateService(service, patch)}
                  />
                  <button
                    className={`icon-btn ${service.pinned ? 'is-on' : ''}`}
                    onClick={event => {
                      event.stopPropagation();
                      onTogglePin(service);
                    }}
                    aria-label={
                      service.pinned
                        ? t('Unpin {name}', { name: service.name })
                        : t('Pin {name}', { name: service.name })
                    }
                    title={service.pinned ? t('Unpin') : t('Pin to sidebar')}
                  >
                    <Icon name="pin" size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={event => {
                      event.stopPropagation();
                      onEdit(service);
                    }}
                    aria-label={t('Edit {name}', { name: service.name })}
                    title={t('Edit')}
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={event => {
                      event.stopPropagation();
                      onDelete(service);
                    }}
                    aria-label={t('Remove {name}', { name: service.name })}
                    title={t('Remove')}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>

              <h3>{service.name}</h3>
              <p className="service-host mono">{hostOf(service.url)}</p>

              <footer className="service-card-foot">
                <span className="tag mono">
                  {t(CATEGORIES.find(item => item.id === service.category)?.label ?? 'Other')}
                </span>
                <span className="color-mark" style={{ background: service.color }} aria-hidden="true" />
                <span className="mono open-hint">
                  {t('Open')} <Icon name="forward" size={12} />
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}

      <section className="secret-service" aria-labelledby="secret-services-title">
        <div className="section-head">
          <h2 id="secret-services-title">{t('Secret services')}</h2>
          <span className="mono muted-label">{t('BUILT IN · LOCAL FILES')}</span>
        </div>
        <div className="secret-grid">
          <button className="secret-card is-tool" onClick={() => onSecretTool('lexium')}>
            <ElementMark tool="lexium" size={58} />
            <span className="secret-card-copy">
              <span className="mono secret-card-kicker">{t('x530 / LANGUAGE')}</span>
              <strong>{t('Lexium')}</strong>
              <span>
                {t(
                  'Transcribe recordings, translate chats both ways and read text out of photos — on servers you choose.',
                )}
              </span>
            </span>
            <Icon name="forward" size={16} />
          </button>

          <button className="secret-card is-tool" onClick={() => onSecretTool('player')}>
            <ElementMark tool="player" size={58} />
            <span className="secret-card-copy">
              <span className="mono secret-card-kicker">{t('x531 / MEDIA')}</span>
              <strong>{t('Media player')}</strong>
              <span>
                {t(
                  'A queue for local audio, video and direct links, with repeat and shuffle docked along the bottom.',
                )}
              </span>
            </span>
            <Icon name="forward" size={16} />
          </button>

          <button className="secret-card is-tool" onClick={() => onSecretTool('emulator')}>
            <ElementMark tool="emulator" size={58} />
            <span className="secret-card-copy">
              <span className="mono secret-card-kicker">{t('8-BIT MODE')}</span>
              <strong>{t('Secret emulator')}</strong>
              <span>
                {t(
                  'Load Nintendo, Sega, Atari, PC Engine, WonderSwan, Neo Geo Pocket and Virtual Boy files you already own.',
                )}
              </span>
            </span>
            <Icon name="forward" size={16} />
          </button>
        </div>
      </section>

      <p className="footnote mono">
        {t('PALETTE {count} COLORS · MAX 100 MODULES · LOCAL PERSISTENCE', {
          count: SERVICE_COLORS.length.toString().padStart(2, '0'),
        })}
      </p>
    </section>
  );
}
