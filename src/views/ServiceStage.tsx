import { useRef, useState } from 'react';
import type { Service } from '../types';
import { CATEGORIES, partitionFor } from '../lib/services';
import { useT } from '../lib/i18n';
import { hostOf } from '../lib/url';
import { Icon, ServiceIcon, ThemeMark, type ThemeMarkKind } from '../components/ui';
import { Webview, type WebviewElement, type WebviewStatus } from '../components/Webview';

interface StageProps {
  services: Service[];
  openIds: string[];
  activeId: string | null;
  reloadTokens: Record<string, number>;
  /** Changes when engine preferences change, so guests are rebuilt. */
  engineRevision: number;
  isElectron: boolean;
  unread: Record<string, number>;
  notifications: boolean;
  mark?: ThemeMarkKind;
  onBack: () => void;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
  onClearSession: (service: Service) => void;
  onTitle: (service: Service, title: string) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}

/**
 * Keeps every opened service mounted for the whole app session.
 *
 * A webview that is unmounted reloads from scratch next time it is shown: a
 * chat client reconnects its gateway, re-runs bootstrap and, in Discord's
 * case, can decide the stored token is stale. Keeping the guest alive keeps
 * the connection, the scroll position, an in-progress call and the session
 * itself intact while the user works somewhere else in Kryvex. Inactive frames
 * are hidden, never destroyed; only closing the app or clearing a session
 * ends them.
 */
export function ServiceStage({
  services,
  openIds,
  activeId,
  reloadTokens,
  engineRevision,
  isElectron,
  unread,
  notifications,
  mark = 'kx',
  onBack,
  onEdit,
  onDelete,
  onClearSession,
  onTitle,
  onToast,
}: StageProps) {
  const active = services.find(service => service.id === activeId) ?? null;
  const open = openIds
    .map(id => services.find(service => service.id === id))
    .filter((service): service is Service => Boolean(service));

  if (open.length === 0) return null;

  return (
    <section className={`service-stage ${active ? 'has-active' : 'is-idle'}`} aria-hidden={!active}>
      {open.map(service => (
        <ServiceFrame
          key={`${service.id}-${reloadTokens[service.id] ?? 0}-${engineRevision}`}
          service={service}
          active={service.id === activeId}
          isElectron={isElectron}
          unread={unread[service.id] ?? 0}
          notifications={notifications}
          mark={mark}
          onBack={onBack}
          onEdit={onEdit}
          onDelete={onDelete}
          onClearSession={onClearSession}
          onTitle={title => onTitle(service, title)}
          onToast={onToast}
        />
      ))}
    </section>
  );
}

function ServiceFrame({
  service,
  active,
  isElectron,
  unread,
  notifications,
  mark = 'kx',
  onBack,
  onEdit,
  onDelete,
  onClearSession,
  onTitle,
  onToast,
}: {
  service: Service;
  active: boolean;
  isElectron: boolean;
  unread: number;
  notifications: boolean;
  mark?: ThemeMarkKind;
  onBack: () => void;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
  onClearSession: (service: Service) => void;
  onTitle: (title: string) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const t = useT();
  const controller = useRef<WebviewElement | null>(null);
  const [status, setStatus] = useState<WebviewStatus>({
    loading: true,
    canGoBack: false,
    canGoForward: false,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  const category = t(CATEGORIES.find(item => item.id === service.category)?.label ?? 'Other');
  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <div
      className={`service-frame ${active ? 'is-active' : ''}`}
      data-service={service.id}
      aria-hidden={!active}
    >
      <header className="service-toolbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('Back to services')} title={t('Back')}>
          <Icon name="back" size={16} />
        </button>

        <ServiceIcon service={service} size={30} />

        <div className="service-id">
          <div className="service-title-line">
            <h1>{service.name}</h1>
            <span className="tag mono">{category}</span>
            {service.pinned ? <span className="tag mono accent">{t('PINNED')}</span> : null}
            {unread > 0 ? (
              <span className="tag mono service-unread" aria-label={t('{count} unread', { count: unread })}>
                {badge}
              </span>
            ) : null}
          </div>
          <span className="mono service-url">{hostOf(service.url)}</span>
        </div>

        <div className="service-actions">
          <span
            className={`mono service-live ${notifications ? 'is-on' : ''}`}
            title={
              notifications
                ? t('Desktop notifications are on for installed services.')
                : t('Desktop notifications are off in Settings.')
            }
          >
            <span className="status-dot" />
            {notifications ? t('LIVE') : t('QUIET')}
          </span>
          <button
            className="icon-btn"
            onClick={() => controller.current?.reload()}
            title={t('Reload')}
            aria-label={t('Reload service')}
          >
            <Icon name="reload" size={16} />
          </button>
          <button
            className="btn secondary small"
            onClick={() => {
              void window.kryvex?.openExternal(service.url);
              onToast(t('Opened in your default browser.'), 'info');
            }}
          >
            <Icon name="external" size={14} />
            {t('Open externally')}
          </button>
          <button
            className="icon-btn"
            onClick={() => onClearSession(service)}
            title={t('Clear this session')}
            aria-label={t('Clear this session')}
          >
            <Icon name="lock" size={16} />
          </button>
          <button className="icon-btn" onClick={() => onEdit(service)} title={t('Edit')} aria-label={t('Edit service')}>
            <Icon name="edit" size={16} />
          </button>
          <button
            className="icon-btn danger"
            onClick={() => onDelete(service)}
            title={t('Remove')}
            aria-label={t('Remove service')}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </header>

      <div className="service-canvas">
        {active && status.loading && !status.error ? (
          <div className="loading-bar" aria-hidden="true" />
        ) : null}

        {!isElectron ? (
          <div className="webview-fallback">
            <ThemeMark mark={mark} size={128} variant="tile" />
            <h2>{service.name}</h2>
            <p>
              {t(
                'Service webviews render inside the Electron shell, where Kryvex can give this module its own persistent session. This browser preview only shows the app surface.',
              )}
            </p>
            <div className="fallback-meta mono">
              <span>{t('PARTITION {partition}', { partition: partitionFor(service.id) })}</span>
              <span>{service.url}</span>
            </div>
            <a className="btn secondary" href={service.url} target="_blank" rel="noreferrer">
              {t('Open in this browser')}
            </a>
          </div>
        ) : (
          <Webview
            key={`${service.id}-${reloadKey}`}
            src={service.url}
            partition={partitionFor(service.id)}
            allowPopups
            controller={controller}
            onStatus={setStatus}
            onTitle={onTitle}
            onNavigate={url => {
              if (active && url !== service.url) {
                onToast(t('Navigated to {host}', { host: hostOf(url) }), 'info');
              }
            }}
          />
        )}

        {active && status.error ? (
          <div className="webview-error" role="alert">
            <Icon name="shield" size={22} />
            <h3>{t('This module could not load')}</h3>
            <p>{status.error}</p>
            <div className="error-actions">
              <button
                className="btn primary"
                onClick={() => {
                  setStatus({ ...status, error: null, loading: true });
                  setReloadKey(value => value + 1);
                }}
              >
                {t('Try again')}
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  void window.kryvex?.openExternal(service.url);
                }}
              >
                {t('Open externally')}
              </button>
            </div>
            <p className="mono error-note">
              {t(
                'Some sites refuse embedding with frame or cookie policies. Kryvex never disables security to force them in.',
              )}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
