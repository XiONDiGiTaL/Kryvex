import type { HomeCountdown } from '../types';

/**
 * Countdowns: a label and a moment, either a whole day or an exact time.
 *
 * Everything here is local-time arithmetic, because a milestone is a calendar
 * fact for the person watching it. The renderer decides how to phrase the
 * result so the same state reads correctly in every language.
 */
export const MAX_COUNTDOWNS = 8;
export const MAX_COUNTDOWN_LABEL = 80;
/** 2000-01-01 to 2100-01-01; anything else is a typo or a broken file. */
export const MIN_COUNTDOWN_TARGET = Date.UTC(2000, 0, 1);
export const MAX_COUNTDOWN_TARGET = Date.UTC(2100, 0, 1);

export function sanitizeCountdowns(raw: unknown): HomeCountdown[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: HomeCountdown[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 64) continue;
    if (seen.has(entry.id)) continue;
    if (typeof entry.label !== 'string') continue;
    const label = entry.label.trim().slice(0, MAX_COUNTDOWN_LABEL);
    if (!label) continue;
    const target = typeof entry.target === 'number' ? entry.target : Number.NaN;
    if (!Number.isFinite(target)) continue;
    if (target < MIN_COUNTDOWN_TARGET || target > MAX_COUNTDOWN_TARGET) continue;
    seen.add(entry.id);
    out.push({
      id: entry.id,
      label,
      target: Math.round(target),
      allDay: entry.allDay === true,
    });
  }
  out.sort((a, b) => a.target - b.target);
  return out.slice(0, MAX_COUNTDOWNS);
}

/** Soonest first, so the list reads like an agenda. */
export function addCountdown(list: HomeCountdown[], entry: HomeCountdown): HomeCountdown[] {
  if (list.some(item => item.id === entry.id)) return list;
  return [...list, entry].sort((a, b) => a.target - b.target).slice(0, MAX_COUNTDOWNS);
}

export function removeCountdown(list: HomeCountdown[], id: string): HomeCountdown[] {
  return list.filter(item => item.id !== id);
}

export type CountdownPhase = 'now' | 'future' | 'past';
export type CountdownUnit = 'minutes' | 'hours' | 'days';

export interface CountdownState {
  phase: CountdownPhase;
  /** How many of `unit` are left, or how many have passed. Zero for 'now'. */
  amount: number;
  unit: CountdownUnit;
}

/** The local calendar day of a timestamp, as a comparable number. */
function localDay(at: number): number {
  const date = new Date(at);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function countdownState(
  countdown: Pick<HomeCountdown, 'target' | 'allDay'>,
  now: Date = new Date(),
): CountdownState {
  if (countdown.allDay) {
    // A date-only target means the whole day: it is not "past" until tomorrow.
    const days = Math.round((localDay(countdown.target) - localDay(now.getTime())) / 86_400_000);
    if (days === 0) return { phase: 'now', amount: 0, unit: 'days' };
    return days > 0
      ? { phase: 'future', amount: days, unit: 'days' }
      : { phase: 'past', amount: -days, unit: 'days' };
  }
  const diff = countdown.target - now.getTime();
  const away = Math.abs(diff);
  const phase = diff > 0 ? 'future' : 'past';
  if (away < 60_000) return { phase: 'now', amount: 0, unit: 'minutes' };
  if (away < 90 * 60_000) {
    return { phase, amount: Math.max(1, Math.round(away / 60_000)), unit: 'minutes' };
  }
  if (away < 48 * 60 * 60_000) {
    return { phase, amount: Math.round(away / 3_600_000), unit: 'hours' };
  }
  return { phase, amount: Math.round(away / 86_400_000), unit: 'days' };
}

/** `YYYY-MM-DD` for a date input, in local time rather than UTC. */
export function dateInputValue(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `HH:MM` for a time input, or empty when the target is date-only. */
export function timeInputValue(at: number, allDay: boolean): string {
  if (allDay) return '';
  const date = new Date(at);
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

/**
 * Builds the target from a date input and an optional time. A missing or
 * unreadable date returns null, and an empty time makes it date-only.
 */
export function targetFromInputs(date: string, time: string): { target: number; allDay: boolean } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match as unknown as [string, string, string, string];
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const wanted = time.trim();
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(wanted);
  // A time that was typed but cannot be read is an error, not an all-day
  // target: silently dropping it would count down to the wrong moment.
  if (wanted && !clock) return null;
  const allDay = !clock;
  const hours = clock ? Number(clock[1]) : 0;
  const minutes = clock ? Number(clock[2]) : 0;
  const local = new Date(y, m - 1, d, hours, minutes, 0, 0);
  // A date input can produce 2026-02-31; reject what the calendar repaired.
  if (local.getFullYear() !== y || local.getMonth() !== m - 1 || local.getDate() !== d) return null;
  return { target: local.getTime(), allDay };
}
