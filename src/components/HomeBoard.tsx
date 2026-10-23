import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { HomeSettings, WeatherResult } from '../types';
import { useI18n } from '../lib/i18n';
import {
  formatTemperature,
  weatherKind,
  weatherLabel,
  windLabel,
  type WeatherKind,
} from '../lib/weather';
import { Icon } from './ui';
import { WellnessBoard } from './WellnessBoard';
import { weatherAtWeb, weatherLookupWeb } from '../lib/weather-web';

function greeting(hour: number): string {
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function WeatherGlyph({
  kind,
  isDay = true,
  size = 42,
}: {
  kind: WeatherKind;
  isDay?: boolean;
  size?: number;
}) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {kind === 'clear' && !isDay ? (
        <path
          {...stroke}
          d="M31 29.5A11.5 11.5 0 0 1 18.5 12 12 12 0 1 0 35.5 29c-1.4.3-3 .5-4.5.5Z"
        />
      ) : null}
      {kind === 'clear' && isDay ? (
        <>
          <circle {...stroke} cx="24" cy="24" r="8" />
          <path {...stroke} d="M24 6v4M24 38v4M6 24h4M38 24h4M11 11l3 3M34 34l3 3M37 11l-3 3M14 34l-3 3" />
        </>
      ) : null}
      {kind === 'partly' ? (
        <>
          <circle {...stroke} cx="18" cy="18" r="5.5" />
          <path {...stroke} d="M18 7.5v2.2M8 18h2M11 11l1.6 1.6M25 11l-1.6 1.6" />
          <path {...stroke} d="M15 34h18a6 6 0 0 0 .6-12 9 9 0 0 0-17-2.4A7 7 0 0 0 15 34Z" />
        </>
      ) : null}
      {kind === 'cloud' ? (
        <path {...stroke} d="M12 32h23a7 7 0 0 0 .7-14 10 10 0 0 0-19-2.7A7.5 7.5 0 0 0 12 32Z" />
      ) : null}
      {kind === 'fog' ? (
        <>
          <path {...stroke} d="M12 27h23a7 7 0 0 0 .7-14 10 10 0 0 0-19-2.7A7.5 7.5 0 0 0 12 27Z" />
          <path {...stroke} d="M10 33h20M16 38h22" />
        </>
      ) : null}
      {(kind === 'rain' || kind === 'drizzle') ? (
        <>
          <path {...stroke} d="M12 26h22a7 7 0 0 0 .7-14 10 10 0 0 0-19-2.7A7.5 7.5 0 0 0 12 26Z" />
          <path {...stroke} d={kind === 'rain' ? 'M17 32l-2 5M25 32l-2 5M33 32l-2 5' : 'M18 33l-1 3M26 33l-1 3M34 33l-1 3'} />
        </>
      ) : null}
      {kind === 'snow' ? (
        <>
          <path {...stroke} d="M12 26h22a7 7 0 0 0 .7-14 10 10 0 0 0-19-2.7A7.5 7.5 0 0 0 12 26Z" />
          <path {...stroke} d="M17 32v4M15 34h4M29 32v4M27 34h4" />
        </>
      ) : null}
      {kind === 'storm' ? (
        <>
          <path {...stroke} d="M12 25h22a7 7 0 0 0 .7-14 10 10 0 0 0-19-2.7A7.5 7.5 0 0 0 12 25Z" />
          <path {...stroke} d="m25 28-5 7h6l-3 6 8-9h-6l3-4Z" />
        </>
      ) : null}
    </svg>
  );
}

export function HomeBoard({
  home,
  onUpdate,
  onOpenSettings,
}: {
  home: HomeSettings;
  onUpdate: (patch: Partial<HomeSettings>) => void;
  onOpenSettings: () => void;
}) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [cityDraft, setCityDraft] = useState(home.city);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [guideOpen, setGuideOpen] = useState(!home.guideSeen);
  const [customizing, setCustomizing] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setCityDraft(home.city);
  }, [home.city]);

  const fetchAtPoint = useCallback(async () => {
    if (home.latitude === null || home.longitude === null) return;
    setWeatherBusy(true);
    try {
      const result = window.kryvex
        ? ((await window.kryvex.weatherAt(home.latitude, home.longitude, home.unit)) as WeatherResult)
        : await weatherAtWeb(home.latitude, home.longitude, home.unit);
      setWeather(result.ok ? result : null);
      setWeatherError(result.ok ? null : result.error ?? 'unavailable');
    } catch {
      setWeather(null);
      setWeatherError('offline');
    } finally {
      setWeatherBusy(false);
    }
  }, [home.latitude, home.longitude, home.unit]);

  useEffect(() => {
    if (!home.showWeather) return;
    void fetchAtPoint();
    // Open-Meteo readings are cached for ten minutes, so a board left open
    // should age out with them instead of showing yesterday's sky forever.
    const timer = window.setInterval(() => void fetchAtPoint(), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [fetchAtPoint, home.showWeather]);

  async function lookUpCity(event?: FormEvent) {
    event?.preventDefault();
    const city = cityDraft.trim();
    if (!city) return;
    setWeatherBusy(true);
    setWeatherError(null);
    try {
      const result = window.kryvex
        ? ((await window.kryvex.weatherLookup(city, home.unit)) as WeatherResult)
        : await weatherLookupWeb(city, home.unit);
      if (!result.ok) {
        setWeather(null);
        setWeatherError(result.error ?? 'unavailable');
        return;
      }
      setWeather(result);
      onUpdate({
        city,
        place: [result.place, result.country].filter(Boolean).join(', '),
        latitude: result.latitude ?? null,
        longitude: result.longitude ?? null,
      });
    } catch {
      setWeather(null);
      setWeatherError('offline');
    } finally {
      setWeatherBusy(false);
    }
  }

  async function changeUnit(unit: 'c' | 'f') {
    onUpdate({ unit });
    if (home.latitude === null || home.longitude === null) return;
    setWeatherBusy(true);
    try {
      const result = window.kryvex
        ? ((await window.kryvex.weatherAt(home.latitude, home.longitude, unit)) as WeatherResult)
        : await weatherAtWeb(home.latitude, home.longitude, unit);
      if (result.ok) {
        setWeather(result);
        setWeatherError(null);
      }
    } catch {
      /* the next refresh keeps the previous reading */
    } finally {
      setWeatherBusy(false);
    }
  }

  const kind = weather?.current ? weatherKind(weather.current.code) : 'cloud';
  const openNotes = useMemo(() => home.notes.filter(note => !note.done).length, [home.notes]);
  const clock = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });

  function addNote(event: FormEvent) {
    event.preventDefault();
    const text = noteDraft.trim();
    if (!text || home.notes.length >= 40) return;
    onUpdate({
      notes: [
        ...home.notes,
        { id: `note-${Date.now().toString(36)}`, text: text.slice(0, 160), done: false, createdAt: Date.now() },
      ],
    });
    setNoteDraft('');
  }

  return (
    <section className="home-board" aria-label={t('Home board')}>
      <div className="home-board-glow" aria-hidden="true" />

      <div className="home-board-main">
        <div className="home-board-top">
          <div className="home-clock">
            <span className="home-greeting">{t(greeting(now.getHours()))}</span>
            <strong className="home-time">{clock}</strong>
            <span className="mono home-date">{date}</span>
          </div>

          <div className="home-board-tools">
            <button
              className={`home-heart ${home.wellness.onboarded ? '' : 'is-fresh'}`}
              onClick={() => setWellnessOpen(true)}
              title={t('Wellness')}
              aria-label={t('Open wellness details')}
            >
              <Icon name="heart" size={14} />
            </button>
            <button
              className="home-customize"
              onClick={() => setCustomizing(value => !value)}
              aria-expanded={customizing}
              title={t('Choose Home widgets')}
            >
              <Icon name="sliders" size={14} />
              {t('Widgets')}
            </button>
          </div>
        </div>

        {customizing ? (
          <div className="home-widget-picker" role="group" aria-label={t('Home widgets')}>
            {(
              [
                ['showWeather', 'Weather'],
                ['showTasks', 'Tasks'],
                ['showWellness', 'Wellness'],
                ['showGuide', 'Board guide'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={`chip-btn ${home[key] ? 'is-active' : ''}`}
                aria-pressed={home[key]}
                onClick={() => onUpdate({ [key]: !home[key] } as Partial<HomeSettings>)}
              >
                {t(label)}
              </button>
            ))}
            <button className="link" onClick={onOpenSettings}>
              {t('More settings')} <Icon name="chevron" size={12} />
            </button>
          </div>
        ) : null}

        {home.showWeather ? (
          <div className="home-weather">
            <button
              className={`home-weather-glyph ${weatherBusy ? 'is-busy' : ''}`}
              onClick={() => void fetchAtPoint()}
              disabled={weatherBusy || home.latitude === null}
              title={t('Refresh conditions')}
              aria-label={t('Refresh weather')}
            >
              <WeatherGlyph kind={kind} isDay={weather?.current?.isDay ?? true} size={46} />
            </button>
            <div className="home-weather-copy">
              <div className="home-weather-line">
                {weather?.current ? (
                  <>
                    <strong className="home-temp">{formatTemperature(weather.current.temperature, home.unit)}</strong>
                    <span>{t(weatherLabel(weather.current.code))}</span>
                  </>
                ) : (
                  <strong className="home-temp">{weatherBusy ? '··' : '—'}</strong>
                )}
                <div className="home-unit" role="group" aria-label={t('Temperature unit')}>
                  {(['c', 'f'] as const).map(unit => (
                    <button
                      key={unit}
                      className={home.unit === unit ? 'is-active' : ''}
                      aria-pressed={home.unit === unit}
                      onClick={() => void changeUnit(unit)}
                    >
                      °{unit.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <span className="mono home-weather-place">
                {weather?.ok
                  ? [weather.place, weather.country].filter(Boolean).join(', ') || home.place || t('Local conditions')
                  : home.place || t('Set a city for local conditions')}
              </span>
              {weather?.current ? (
                <span className="mono home-weather-detail">
                  {t('Feels {temp}', {
                    temp: formatTemperature(weather.current.apparent, home.unit),
                  })}
                  {' · '}
                  {t('Wind {wind}', { wind: windLabel(weather.current.wind, home.unit) })}
                  {' · '}
                  {t('Humidity {value}%', { value: weather.current.humidity })}
                </span>
              ) : weatherError ? (
                <span className="home-weather-detail is-error">
                  {weatherError === 'offline'
                    ? t('Weather is unreachable right now.')
                    : weatherError === 'not-found'
                      ? t('That city could not be found.')
                      : t('Weather is unavailable right now.')}
                </span>
              ) : null}
            </div>
            <form className="home-weather-form" onSubmit={event => void lookUpCity(event)}>
              <input
                value={cityDraft}
                onChange={event => setCityDraft(event.target.value)}
                placeholder={t('City or town')}
                aria-label={t('City for weather')}
                maxLength={80}
              />
              <button type="submit" className="btn secondary small" disabled={weatherBusy || !cityDraft.trim()}>
                {weatherBusy ? t('Checking…') : t('Update')}
              </button>
            </form>
            <span className="mono home-weather-credit">
              {t('Conditions by Open-Meteo · only the place you choose leaves this device')}
            </span>
          </div>
        ) : null}

        <WellnessBoard
          home={home}
          open={wellnessOpen}
          onOpen={() => setWellnessOpen(true)}
          onClose={() => setWellnessOpen(false)}
          onUpdate={onUpdate}
        />

        {home.showTasks ? (
          <div className="home-tasks">
            <div className="home-tasks-head">
              <span className="mono">{t('STICKY NOTES')}</span>
              <span className="mono">{t('{count} OPEN', { count: openNotes })}</span>
            </div>
            {home.notes.length === 0 ? (
              <p className="home-tasks-empty">{t('Pin a reminder for today. It stays on this machine.')}</p>
            ) : (
              <ul className="home-task-list">
                {home.notes.map(note => (
                  <li key={note.id} className={note.done ? 'is-done' : ''}>
                    <button
                      className="home-task-check"
                      aria-label={note.done ? t('Mark “{text}” open', { text: note.text }) : t('Mark “{text}” done', { text: note.text })}
                      aria-pressed={note.done}
                      onClick={() =>
                        onUpdate({
                          notes: home.notes.map(item =>
                            item.id === note.id ? { ...item, done: !item.done } : item,
                          ),
                        })
                      }
                    >
                      {note.done ? <Icon name="check" size={11} /> : null}
                    </button>
                    <span>{note.text}</span>
                    <button
                      className="home-task-remove"
                      aria-label={t('Remove “{text}”', { text: note.text })}
                      onClick={() => onUpdate({ notes: home.notes.filter(item => item.id !== note.id) })}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="home-task-form" onSubmit={addNote}>
              <input
                value={noteDraft}
                onChange={event => setNoteDraft(event.target.value)}
                placeholder={t('New task')}
                aria-label={t('New task')}
                maxLength={160}
              />
              <button type="submit" className="icon-btn" disabled={!noteDraft.trim()} aria-label={t('Add task')}>
                <Icon name="plus" size={14} />
              </button>
            </form>
          </div>
        ) : null}
      </div>

      {home.showGuide ? (
        <aside className="home-guide">
          <button
            className="home-guide-head"
            onClick={() => {
              setGuideOpen(value => !value);
              if (!home.guideSeen) onUpdate({ guideSeen: true });
            }}
            aria-expanded={guideOpen}
          >
            <span className="mono">{t('BOARD GUIDE')}</span>
            <span className="home-guide-title">{t('A calmer home, built into the shell')}</span>
            <Icon name="chevron" size={14} className={guideOpen ? 'flip-y' : ''} />
          </button>
          {guideOpen ? (
            <div className="home-guide-body">
              <p>
                {t(
                  'This board is native to Kryvex: a clock and greeting, local weather, sticky tasks and a short guide to how the surface fits together. There is no extension, account or new-tab takeover.',
                )}
              </p>
              <p>
                {t(
                  'It draws over your active theme with a translucent pane, so the workspace still looks like Kryvex rather than a page pasted on top of it.',
                )}
              </p>
              <ul>
                <li>{t('The clock and greeting follow your system language and time.')}</li>
                <li>{t('Weather is keyless Open-Meteo data for the place you choose, cached for ten minutes.')}</li>
                <li>{t('Tasks are local state, written to the same JSON file as everything else.')}</li>
                <li>{t('Hide any widget from the Widgets button; nothing is installed.')}</li>
              </ul>
              <div className="home-guide-actions">
                <button className="link" onClick={onOpenSettings}>
                  {t('Board settings')} <Icon name="chevron" size={12} />
                </button>
                <button
                  className="link"
                  onClick={() => {
                    setGuideOpen(false);
                    onUpdate({ guideSeen: true });
                  }}
                >
                  {t('Got it')}
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}
