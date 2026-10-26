import { useState, type FormEvent } from 'react';
import type { HomeSettings } from '../types';
import { useI18n } from '../lib/i18n';
import { makeId } from '../lib/services';
import {
  MAX_COUNTDOWNS,
  MAX_COUNTDOWN_LABEL,
  addCountdown,
  countdownState,
  dateInputValue,
  removeCountdown,
  targetFromInputs,
  type CountdownState,
} from '../lib/countdowns';
import { Icon } from './ui';

function remainingText(
  t: (key: string, params?: Record<string, string | number>) => string,
  state: CountdownState,
): string {
  if (state.phase === 'now') return t('Now');
  const future = state.phase === 'future';
  if (state.unit === 'minutes') {
    return future ? t('in {count} min', { count: state.amount }) : t('{count} min ago', { count: state.amount });
  }
  if (state.unit === 'hours') {
    return future ? t('in {count} h', { count: state.amount }) : t('{count} h ago', { count: state.amount });
  }
  return future ? t('in {count} days', { count: state.amount }) : t('{count} days ago', { count: state.amount });
}

/**
 * Countdowns: a milestone and the time left before it.
 *
 * A date alone means the whole day, so it reads "Today" until tomorrow instead
 * of snapping to "past" at midnight. Adding a time makes it exact, and the same
 * list then counts down the hours.
 */
export function CountdownWidget({
  home,
  onUpdate,
}: {
  home: HomeSettings;
  onUpdate: (patch: Partial<HomeSettings>) => void;
}) {
  const { t, locale } = useI18n();
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const now = new Date();
  const full = home.countdowns.length >= MAX_COUNTDOWNS;
  const parsed = targetFromInputs(date, time);

  function add(event: FormEvent) {
    event.preventDefault();
    const text = label.trim();
    if (!text || !parsed || full) return;
    onUpdate({
      countdowns: addCountdown(home.countdowns, {
        id: makeId('cd'),
        label: text.slice(0, MAX_COUNTDOWN_LABEL),
        target: parsed.target,
        allDay: parsed.allDay,
      }),
    });
    setLabel('');
    setDate('');
    setTime('');
  }

  function when(target: number, allDay: boolean): string {
    const day = new Date(target).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (allDay) return day;
    const clock = new Date(target).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${day} · ${clock}`;
  }

  return (
    <div className="home-countdown">
      <div className="home-card-head">
        <span className="mono">{t('COUNTDOWNS')}</span>
        <span className="mono">{t('{count} TRACKED', { count: home.countdowns.length })}</span>
      </div>
      {home.countdowns.length === 0 ? (
        <p className="home-tasks-empty">
          {t('A release, a deadline, an appointment: add the date and it counts down here.')}
        </p>
      ) : (
        <ul className="home-countdown-list">
          {home.countdowns.map(item => {
            const state = countdownState(item, now);
            return (
              <li key={item.id} className={state.phase === 'past' ? 'is-past' : ''}>
                <div>
                  <strong>{item.label}</strong>
                  <span className="mono">{when(item.target, item.allDay)}</span>
                </div>
                <span className="chip-btn home-countdown-left">{remainingText(t, state)}</span>
                <button
                  className="home-task-remove"
                  aria-label={t('Remove “{text}”', { text: item.label })}
                  onClick={() => onUpdate({ countdowns: removeCountdown(home.countdowns, item.id) })}
                >
                  <Icon name="close" size={11} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="home-countdown-form" onSubmit={add}>
        <input
          value={label}
          onChange={event => setLabel(event.target.value)}
          placeholder={full ? t('No room left. Remove one first.') : t('What is it for?')}
          aria-label={t('Countdown label')}
          maxLength={MAX_COUNTDOWN_LABEL}
          disabled={full}
        />
        <div className="home-countdown-when">
          <label>
            <span>{t('Date')}</span>
            <input
              type="date"
              value={date}
              min={dateInputValue(now.getTime())}
              onChange={event => setDate(event.target.value)}
              aria-label={t('Countdown date')}
              disabled={full}
            />
          </label>
          <label>
            <span>{t('Time')}</span>
            <input
              type="time"
              value={time}
              onChange={event => setTime(event.target.value)}
              aria-label={t('Countdown time')}
              disabled={full}
            />
          </label>
          <button
            type="submit"
            className="btn secondary small"
            disabled={!label.trim() || !parsed || full}
          >
            <Icon name="plus" size={12} />
            {t('Add')}
          </button>
        </div>
        <span className="mono home-countdown-hint">
          {t('Leave the time empty for a whole-day countdown.')}
        </span>
      </form>
    </div>
  );
}
