import { useMemo, useState } from 'react';
import type { PersistedState, Service } from '../types';
import { activityServices, unreadCount } from '../../electron/activity-rules';
import { Icon } from '../components/ui';
import { useT } from '../lib/i18n';

/**
 * The Activity Center.
 *
 * Modules are other people's pages running on this machine, and they raise
 * notifications the way their web versions do. This is where those land: a
 * bounded, local log with the module they came from, so a notification that
 * arrived while another view was in front is still findable — and one click
 * takes the reader to the module that raised it.
 *
 * It is a log, not a feed: nothing is fetched, nothing is summarised, and the
 * list only ever holds what a page actually tried to show.
 */
export function Activity({
  state,
  onOpenService,
  onMarkRead,
  onClear,
  onSetService,
}: {
  state: PersistedState;
  onOpenService: (id: string) => void;
  /** Mark one entry read, or all of them when no id is given. */
  onMarkRead: (id?: string) => void;
  /** Drop the log, or one module's part of it. */
  onClear: (serviceId?: string) => void;
  onSetService: (service: Service, patch: Partial<Service>) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<string | null>(null);
  const entries = useMemo(() => state.activity ?? [], [state.activity]);
  const modules = useMemo(() => activityServices(entries), [entries]);
  const shown = useMemo(
    () => (filter ? entries.filter(entry => entry.serviceId === filter) : entries),
    [entries, filter],
  );
  const unread = unreadCount(entries);
  const selected = filter ? state.services.find(service => service.id === filter) ?? null : null;

  return (
    <section className="view activity-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">{t('ACTIVITY')}</p>
          <h1>{t('Activity Center')}</h1>
          <p className="lede">
            {t('Notifications a module raised, newest first. Nothing here is sent anywhere.')}
          </p>
        </div>
        <div className="view-head-actions">
          {unread > 0 ? (
            <button className="btn secondary small" onClick={() => onMarkRead()}>
              <Icon name="check" size={14} />
              {t('Mark all read')}
            </button>
          ) : null}
          {entries.length > 0 ? (
            <button className="btn ghost small" onClick={() => onClear(filter ?? undefined)}>
              <Icon name="trash" size={14} />
              {selected ? t('Clear this module') : t('Clear')}
            </button>
          ) : null}
        </div>
      </header>

      <div className="activity-filters">
        <button
          className={`chip ${filter === null ? 'is-active' : ''}`}
          onClick={() => setFilter(null)}
        >
          {t('All modules')}
          <span className="mono">{entries.length}</span>
        </button>
        {modules.map(module => (
          <button
            key={module.id}
            className={`chip ${filter === module.id ? 'is-active' : ''}`}
            onClick={() => setFilter(module.id)}
          >
            {module.name}
            {module.unread > 0 ? <span className="mono">{module.unread}</span> : null}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="activity-policy">
          <label>
            <input
              type="checkbox"
              checked={selected.notifications !== false}
              onChange={() =>
                onSetService(selected, { notifications: selected.notifications === false })
              }
            />
            {t('Notifications')}
          </label>
          {selected.notifications === false ? <span className="mono">{t('Muted')}</span> : null}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="empty-state">
          {entries.length === 0
            ? t('Nothing yet. A module that shows a notification lands here.')
            : t('No module has raised a notification yet.')}
        </p>
      ) : (
        <ul className="activity-list">
          {shown.map(entry => {
            const service = state.services.find(item => item.id === entry.serviceId);
            return (
              <li key={entry.id} className={`activity-row ${entry.read ? '' : 'is-unread'}`}>
                <div className="activity-main">
                  <p className="activity-title">
                    {!entry.read ? <span className="activity-dot" aria-hidden="true" /> : null}
                    {entry.title}
                  </p>
                  {entry.body ? <p className="activity-body">{entry.body}</p> : null}
                  <p className="activity-meta mono">
                    <span>{entry.serviceName}</span>
                    {entry.host ? <span>{entry.host}</span> : null}
                    <span>{new Date(entry.at).toLocaleString()}</span>
                  </p>
                </div>
                <div className="activity-actions">
                  {!entry.read ? (
                    <button
                      className="btn ghost small"
                      onClick={() => onMarkRead(entry.id)}
                      aria-label={t('Mark all read')}
                    >
                      {t('Mark all read')}
                    </button>
                  ) : null}
                  {service ? (
                    <button className="btn secondary small" onClick={() => onOpenService(entry.serviceId)}>
                      <Icon name="external" size={14} />
                      {t('Open module')}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
