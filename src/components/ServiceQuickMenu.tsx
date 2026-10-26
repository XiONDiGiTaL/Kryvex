import type { Service, ServicePersistence } from '../types';
import { useT } from '../lib/i18n';
import { OptionsPopover, OPTIONS_CLOSE_EVENT } from './OptionsPopover';
import { Icon } from './ui';

/**
 * The actions a framed module no longer keeps in its title bar.
 *
 * A window shows the controls every desktop window has — minimize, maximize,
 * close — and nothing else, so the per-service plumbing lives here instead of
 * competing for the same corner. A focused module passes none of these and its
 * toolbar is unchanged.
 */
export interface ServiceManageActions {
  onOpenExternal?: () => void;
  /** Returns the module to the stage from a window, or the reverse. */
  onDock?: () => void;
  onClearSession?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}

/** Closes the panel this action came from before it changes the view. */
function run(action: () => void) {
  return () => {
    document.dispatchEvent(new CustomEvent(OPTIONS_CLOSE_EVENT));
    action();
  };
}

export function ServiceQuickMenu({
  service,
  notificationsGloballyOn,
  variant = 'card',
  onChange,
  manage,
}: {
  service: Service;
  notificationsGloballyOn: boolean;
  variant?: 'card' | 'toolbar';
  onChange: (patch: Partial<Service>) => void;
  manage?: ServiceManageActions;
}) {
  const t = useT();
  const notificationsOn = service.notifications !== false;
  const keepRunning = (service.persistence ?? 'keep') === 'keep';

  return (
    <OptionsPopover
      name={service.name}
      variant={variant}
      triggerTitle={t('Sound, notifications and background behavior')}
    >
      <div className="service-quick-row">
        <div>
          <strong>{t('Mute sound')}</strong>
          <span>{t('Silences this service without changing the site’s own setting.')}</span>
        </div>
        <button
          className={`switch ${service.muted ? 'is-on' : ''}`}
          role="switch"
          aria-checked={Boolean(service.muted)}
          aria-label={t('Mute {name}', { name: service.name })}
          onClick={() => onChange({ muted: !service.muted })}
        >
          <span />
        </button>
      </div>
      <div className="service-quick-row">
        <div>
          <strong>{t('Notifications')}</strong>
          <span>
            {notificationsGloballyOn
              ? t('Show desktop notifications from this service.')
              : t('The global notification switch in Settings is off.')}
          </span>
        </div>
        <button
          className={`switch ${notificationsOn ? 'is-on' : ''}`}
          role="switch"
          aria-checked={notificationsOn}
          aria-label={t('Notifications for {name}', { name: service.name })}
          onClick={() => onChange({ notifications: !notificationsOn })}
        >
          <span />
        </button>
      </div>
      <div className="service-quick-row">
        <div>
          <strong>{t('Keep running in the background')}</strong>
          <span>
            {keepRunning
              ? t('Session stays warm, like a desktop chat app.')
              : t('Audio and video pause while another view is open.')}
          </span>
        </div>
        <button
          className={`switch ${keepRunning ? 'is-on' : ''}`}
          role="switch"
          aria-checked={keepRunning}
          aria-label={t('Keep {name} running', { name: service.name })}
          onClick={() =>
            onChange({
              persistence: (keepRunning ? 'pause' : 'keep') as ServicePersistence,
            })
          }
        >
          <span />
        </button>
      </div>

      {manage ? (
        <div className="service-quick-manage">
          {manage.onOpenExternal ? (
            <button className="btn ghost small" onClick={run(manage.onOpenExternal)}>
              <Icon name="external" size={13} />
              {t('Open externally')}
            </button>
          ) : null}
          {manage.onDock ? (
            <button className="btn ghost small" onClick={run(manage.onDock)}>
              <Icon name="monitor" size={13} />
              {t('Dock this module')}
            </button>
          ) : null}
          {manage.onClearSession ? (
            <button className="btn ghost small" onClick={run(manage.onClearSession)}>
              <Icon name="lock" size={13} />
              {t('Clear this session')}
            </button>
          ) : null}
          {manage.onEdit ? (
            <button className="btn ghost small" onClick={run(manage.onEdit)}>
              <Icon name="edit" size={13} />
              {t('Edit service')}
            </button>
          ) : null}
          {manage.onRemove ? (
            <button className="btn danger-outline small" onClick={run(manage.onRemove)}>
              <Icon name="trash" size={13} />
              {t('Remove service')}
            </button>
          ) : null}
        </div>
      ) : null}
    </OptionsPopover>
  );
}
