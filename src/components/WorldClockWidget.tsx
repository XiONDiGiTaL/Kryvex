import { useState } from 'react';
import type { HomeSettings } from '../types';
import { useI18n } from '../lib/i18n';
import {
  COMMON_ZONES,
  MAX_WORLD_CLOCKS,
  formatZoneTime,
  offsetLabel,
  sanitizeWorldClocks,
  shownZones,
  toggleZone,
  zoneCity,
  zoneDayShift,
  zoneOffsetMinutes,
} from '../lib/world-clock';
import { Icon } from './ui';

/**
 * The world clock: up to four zones, or what the system already knows.
 *
 * An empty list is not an error state. It shows this machine's zone and UTC,
 * which is what "readily available" means when nothing has been chosen yet, and
 * the picker is right there for the rest.
 */
export function WorldClockWidget({
  home,
  onUpdate,
}: {
  home: HomeSettings;
  onUpdate: (patch: Partial<HomeSettings>) => void;
}) {
  const { t, locale } = useI18n();
  const [pick, setPick] = useState('');
  const now = new Date();
  const chosen = sanitizeWorldClocks(home.worldClocks);
  const zones = shownZones(chosen);
  const options = COMMON_ZONES.filter(zone => !chosen.includes(zone));
  const full = chosen.length >= MAX_WORLD_CLOCKS;

  return (
    <div className="home-clock">
      <div className="home-card-head">
        <span className="mono">{t('WORLD CLOCK')}</span>
        <span className="mono">
          {chosen.length === 0 ? t('SYSTEM') : t('{count} OF 4', { count: chosen.length })}
        </span>
      </div>
      <ul className="home-clock-list">
        {zones.map(zone => {
          const offset = zoneOffsetMinutes(zone, now);
          const shifted = zoneDayShift(zone, locale, now);
          return (
            <li key={zone}>
              <div>
                <strong>{zoneCity(zone)}</strong>
                <span className="mono">
                  {offset === null ? zone : offsetLabel(offset)}
                  {shifted ? ` · ${shifted}` : ''}
                </span>
              </div>
              <span className="mono home-clock-time">{formatZoneTime(zone, locale, now)}</span>
              {chosen.includes(zone) ? (
                <button
                  className="home-task-remove"
                  aria-label={t('Remove {zone}', { zone: zoneCity(zone) })}
                  onClick={() => onUpdate({ worldClocks: toggleZone(chosen, zone) })}
                >
                  <Icon name="close" size={11} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {chosen.length === 0 ? (
        <span className="mono home-clock-hint">
          {t('Showing this device and UTC. Add up to four zones.')}
        </span>
      ) : null}
      <div className="home-clock-form">
        <select
          value={pick}
          onChange={event => setPick(event.target.value)}
          aria-label={t('Add a time zone')}
          disabled={full}
        >
          <option value="">{full ? t('Four zones is the limit') : t('Add a zone…')}</option>
          {options.map(zone => (
            <option key={zone} value={zone}>
              {zoneCity(zone)} · {zone}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn"
          disabled={!pick || full}
          aria-label={t('Add this zone')}
          onClick={() => {
            onUpdate({ worldClocks: toggleZone(chosen, pick) });
            setPick('');
          }}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
    </div>
  );
}
