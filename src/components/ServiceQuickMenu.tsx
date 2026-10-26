import type { Service, ServicePersistence } from '../types';
import { useT } from '../lib/i18n';
import { OptionsPopover } from './OptionsPopover';

export function ServiceQuickMenu({
  service,
  notificationsGloballyOn,
  variant = 'card',
  onChange,
}: {
  service: Service;
  notificationsGloballyOn: boolean;
  variant?: 'card' | 'toolbar';
  onChange: (patch: Partial<Service>) => void;
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
    </OptionsPopover>
  );
}
