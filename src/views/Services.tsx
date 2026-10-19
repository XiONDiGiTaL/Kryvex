import { useMemo, useState } from 'react';
import type { PersistedState, Service, ServiceCategory } from '../types';
import { CATEGORIES, SERVICE_COLORS } from '../lib/services';
import { hostOf } from '../lib/url';
import { EmptyState, Icon, ServiceIcon } from '../components/ui';

export function Services({
  state,
  onOpen,
  onEdit,
  onAdd,
  onTogglePin,
  onDelete,
}: {
  state: PersistedState;
  onOpen: (service: Service) => void;
  onEdit: (service: Service) => void;
  onAdd: () => void;
  onTogglePin: (service: Service) => void;
  onDelete: (service: Service) => void;
}) {
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
          <p className="eyebrow mono">MODULE REGISTRY / {state.services.length} INSTALLED</p>
          <h1>Services</h1>
          <p className="lede">
            Every entry is a module with its own URL, category and isolated session. Add anything
            that runs in a browser.
          </p>
        </div>
        <button className="btn primary" onClick={onAdd}>
          <Icon name="plus" size={16} />
          Add service
        </button>
      </header>

      <div className="toolbar">
        <label className="search-field">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter by name or host"
            aria-label="Filter services"
          />
          {query ? (
            <button className="icon-btn tiny" onClick={() => setQuery('')} aria-label="Clear filter">
              <Icon name="close" size={13} />
            </button>
          ) : null}
        </label>

        <div className="filter-chips" role="tablist" aria-label="Filter by category">
          <button
            role="tab"
            aria-selected={filter === 'all'}
            className={`chip-btn ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <span className="mono">{state.services.length}</span>
          </button>
          {CATEGORIES.map(category => (
            <button
              key={category.id}
              role="tab"
              aria-selected={filter === category.id}
              className={`chip-btn ${filter === category.id ? 'is-active' : ''}`}
              onClick={() => setFilter(category.id)}
            >
              {category.label} <span className="mono">{counts.get(category.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={state.services.length === 0 ? 'No modules installed' : 'Nothing matches that filter'}
          body={
            state.services.length === 0
              ? 'Add a web app by URL — it gets its own persistent, isolated session and a permanent home here.'
              : 'Try another search term or switch back to the All filter.'
          }
          action={
            state.services.length === 0 ? (
              <button className="btn primary" onClick={onAdd}>
                Add your first service
              </button>
            ) : (
              <button
                className="btn secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
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
              aria-label={`Open ${service.name}`}
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
                  <button
                    className={`icon-btn ${service.pinned ? 'is-on' : ''}`}
                    onClick={event => {
                      event.stopPropagation();
                      onTogglePin(service);
                    }}
                    aria-label={service.pinned ? `Unpin ${service.name}` : `Pin ${service.name}`}
                    title={service.pinned ? 'Unpin' : 'Pin to sidebar'}
                  >
                    <Icon name="pin" size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={event => {
                      event.stopPropagation();
                      onEdit(service);
                    }}
                    aria-label={`Edit ${service.name}`}
                    title="Edit"
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={event => {
                      event.stopPropagation();
                      onDelete(service);
                    }}
                    aria-label={`Remove ${service.name}`}
                    title="Remove"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>

              <h3>{service.name}</h3>
              <p className="service-host mono">{hostOf(service.url)}</p>

              <footer className="service-card-foot">
                <span className="tag mono">
                  {CATEGORIES.find(item => item.id === service.category)?.label ?? 'Other'}
                </span>
                <span className="color-mark" style={{ background: service.color }} aria-hidden="true" />
                <span className="mono open-hint">
                  Open <Icon name="forward" size={12} />
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}

      <p className="footnote mono">
        PALETTE {SERVICE_COLORS.length.toString().padStart(2, '0')} COLORS · MAX 100 MODULES · LOCAL
        PERSISTENCE
      </p>
    </section>
  );
}
