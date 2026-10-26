import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { HomeSettings, WorldClockCity } from '../types';
import { useI18n } from '../lib/i18n';
import {
  MAX_WORLD_CLOCKS,
  addClock,
  clockId,
  formatZoneTime,
  offsetLabel,
  removeClock,
  sanitizeWorldClocks,
  shownClocks,
  zoneOffsetMinutes,
  zoneDayShift,
} from '../lib/world-clock';
import { weatherLookupWeb } from '../lib/weather-web';
import { Icon } from './ui';

interface Match {
  city: string;
  country: string;
  zone: string;
  latitude: number;
  longitude: number;
}

/**
 * The world clock: up to four places, or what the system already knows.
 *
 * A row is a city, not a zone. Looking one up is the same Open-Meteo geocoder the
 * weather card uses, so somebody in İzmir can list İzmir instead of the zone's
 * regional name, Istanbul, which is the same clock but not their city. With
 * nothing chosen the widget still shows this machine and UTC, and the format is a
 * switch rather than a setting: 24-hour by default, 12-hour on a press.
 *
 * The search box is a mode, not furniture: once a city is on the list the card
 * goes back to being a clock, and **Add city** beside the format switch brings
 * the field back. A board with no cities opens with the field already showing,
 * because a first-time reader has nothing to hide it for.
 */
export function WorldClockWidget({
  home,
  onUpdate,
}: {
  home: HomeSettings;
  onUpdate: (patch: Partial<HomeSettings>) => void;
}) {
  const { t, locale } = useI18n();
  const chosen = sanitizeWorldClocks(home.worldClocks);
  const [draft, setDraft] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(chosen.length === 0);
  const field = useRef<HTMLInputElement | null>(null);
  const now = new Date();
  const rows = shownClocks(chosen);
  const full = chosen.length >= MAX_WORLD_CLOCKS;
  const hour12 = home.clockHour12;

  // Removing the last city leaves nothing worth hiding the search for.
  useEffect(() => {
    if (chosen.length === 0) setAdding(true);
  }, [chosen.length]);

  // Opening the field is an instruction to type in it.
  useEffect(() => {
    if (adding) field.current?.focus();
  }, [adding]);

  async function lookUp(event: FormEvent) {
    event.preventDefault();
    const city = draft.trim();
    if (city.length < 2) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setMatch(null);
    try {
      const result = window.kryvex
        ? await window.kryvex.weatherLookup(city, home.unit)
        : await weatherLookupWeb(city, home.unit);
      if (!result.ok || !result.timezone) {
        setError(result.ok ? t('That place has no time zone on record.') : t('That city could not be found.'));
        return;
      }
      setMatch({
        city: result.place || city,
        country: result.country ?? '',
        zone: result.timezone,
        latitude: result.latitude ?? 0,
        longitude: result.longitude ?? 0,
      });
    } catch {
      setError(t('The lookup is unreachable right now.'));
    } finally {
      setBusy(false);
    }
  }

  function applyMatch(entry: Match) {
    if (full && !chosen.some(item => item.zone === entry.zone)) {
      setError(t('Four places is the limit. Remove one first.'));
      return;
    }
    const clock: WorldClockCity = {
      id: clockId(entry.zone, entry.city),
      zone: entry.zone,
      city: entry.city,
      ...(entry.country ? { country: entry.country } : {}),
      latitude: entry.latitude,
      longitude: entry.longitude,
    };
    onUpdate({ worldClocks: addClock(chosen, clock) });
    setNotice(t('{city} is on the clock.', { city: entry.city }));
    setMatch(null);
    setDraft('');
    setError(null);
    // A city was added, so the card returns to being a clock.
    setAdding(false);
  }

  function closeSearch() {
    setAdding(false);
    setMatch(null);
    setDraft('');
    setError(null);
    setNotice(null);
  }

  return (
    <div className="home-world-clock">
      <div className="home-card-head">
        <span className="mono">{t('WORLD CLOCK')}</span>
        <div className="home-clock-head-actions">
          {full || adding ? null : (
            <button
              type="button"
              className="chip-btn home-clock-add"
              onClick={() => setAdding(true)}
              title={t('Add a city to the world clock')}
            >
              <Icon name="plus" size={11} />
              {t('Add city')}
            </button>
          )}
          <button
            type="button"
            className="chip-btn home-clock-mode"
            onClick={() => onUpdate({ clockHour12: !hour12 })}
            aria-pressed={hour12}
            aria-label={hour12 ? t('Use 24-hour time') : t('Use 12-hour time')}
            title={hour12 ? t('Use 24-hour time') : t('Use 12-hour time')}
          >
            {hour12 ? '12H' : '24H'}
          </button>
        </div>
      </div>
      <ul className="home-clock-list">
        {rows.map(entry => {
          const offset = zoneOffsetMinutes(entry.zone, now);
          const shifted = zoneDayShift(entry.zone, locale, now);
          const removable = chosen.some(item => item.id === entry.id);
          return (
            <li key={entry.id}>
              <div className="home-clock-place">
                <strong>{entry.city}</strong>
                <span className="mono">
                  {entry.country ? `${entry.country} · ` : ''}
                  {offset === null ? entry.zone : offsetLabel(offset)}
                  {shifted ? ` · ${shifted}` : ''}
                </span>
              </div>
              <span className="mono home-clock-time">
                {formatZoneTime(entry.zone, locale, now, hour12)}
              </span>
              {removable ? (
                <button
                  className="home-clock-remove"
                  aria-label={t('Remove {city}', { city: entry.city })}
                  title={t('Remove {city}', { city: entry.city })}
                  onClick={() => onUpdate({ worldClocks: removeClock(chosen, entry.id) })}
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
          {t('Showing this device and UTC. Add a city to list it by name.')}
        </span>
      ) : null}

      {adding ? (
        <div className="home-clock-search">
          <form className="home-clock-form" onSubmit={event => void lookUp(event)}>
            <input
              ref={field}
              value={draft}
              onChange={event => {
                setDraft(event.target.value);
                setError(null);
                setNotice(null);
              }}
              placeholder={t('Please enter a city')}
              aria-label={t('Search a city for the clock')}
              maxLength={80}
              disabled={busy}
            />
            <button type="submit" className="btn secondary small" disabled={busy || draft.trim().length < 2}>
              {busy ? t('Looking…') : t('Find')}
            </button>
            {chosen.length > 0 ? (
              <button
                type="button"
                className="icon-btn home-clock-cancel"
                onClick={closeSearch}
                aria-label={t('Close the city search')}
                title={t('Close the city search')}
              >
                <Icon name="close" size={12} />
              </button>
            ) : null}
          </form>

          {match ? (
            <div className="home-clock-match">
              <div>
                <strong>{match.city}</strong>
                <span className="mono">
                  {match.country ? `${match.country} · ` : ''}
                  {match.zone}
                </span>
              </div>
              <button
                type="button"
                className="btn primary small"
                onClick={() => applyMatch(match)}
              >
                {t('Add city')}
              </button>
            </div>
          ) : null}
          {error ? <span className="home-clock-note is-error">{error}</span> : null}
          {notice ? <span className="home-clock-note">{notice}</span> : null}
          {full ? (
            <span className="mono home-clock-hint">
              {t('Four places is the limit. Remove one to add another.')}
            </span>
          ) : null}
        </div>
      ) : notice ? (
        <span className="home-clock-note">{notice}</span>
      ) : null}
    </div>
  );
}
