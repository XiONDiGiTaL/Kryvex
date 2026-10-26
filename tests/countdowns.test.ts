import { describe, expect, it } from 'vitest';
import {
  MAX_COUNTDOWNS,
  addCountdown,
  countdownState,
  dateInputValue,
  removeCountdown,
  sanitizeCountdowns,
  targetFromInputs,
  timeInputValue,
} from '../src/lib/countdowns';
import type { HomeCountdown } from '../src/types';

const now = new Date(2026, 9, 22, 15, 0, 0, 0);

function countdown(target: number, allDay: boolean): HomeCountdown {
  return { id: `cd-${target}-${allDay}`, label: 'Release', target, allDay };
}

describe('countdowns', () => {
  it('reads a date and an optional time in local time', () => {
    const withTime = targetFromInputs('2026-11-01', '09:30');
    expect(withTime?.allDay).toBe(false);
    expect(new Date(withTime?.target ?? 0).getHours()).toBe(9);
    expect(new Date(withTime?.target ?? 0).getMinutes()).toBe(30);

    const dateOnly = targetFromInputs('2026-11-01', '');
    expect(dateOnly?.allDay).toBe(true);
    expect(new Date(dateOnly?.target ?? 0).getHours()).toBe(0);

    expect(targetFromInputs('2026-02-31', '')).toBeNull();
    expect(targetFromInputs('nope', '')).toBeNull();
    expect(targetFromInputs('2026-11-01', '25:00')).toBeNull();
  });

  it('round-trips a target back into the two inputs', () => {
    const target = targetFromInputs('2027-03-09', '18:45');
    expect(dateInputValue(target?.target ?? 0)).toBe('2027-03-09');
    expect(timeInputValue(target?.target ?? 0, false)).toBe('18:45');
    expect(timeInputValue(target?.target ?? 0, true)).toBe('');
  });

  it('keeps a date-only target on its own day instead of expiring at midnight', () => {
    const today = targetFromInputs('2026-10-22', '');
    expect(countdownState(countdown(today?.target ?? 0, true), now)).toEqual({
      phase: 'now',
      amount: 0,
      unit: 'days',
    });
    const tomorrow = targetFromInputs('2026-10-23', '');
    expect(countdownState(countdown(tomorrow?.target ?? 0, true), now)).toEqual({
      phase: 'future',
      amount: 1,
      unit: 'days',
    });
    const yesterday = targetFromInputs('2026-10-21', '');
    expect(countdownState(countdown(yesterday?.target ?? 0, true), now)).toEqual({
      phase: 'past',
      amount: 1,
      unit: 'days',
    });
  });

  it('counts an exact target down by the unit that fits', () => {
    const inMinutes = now.getTime() + 40 * 60_000;
    expect(countdownState(countdown(inMinutes, false), now)).toEqual({
      phase: 'future',
      amount: 40,
      unit: 'minutes',
    });
    const inHours = now.getTime() + 5 * 3_600_000;
    expect(countdownState(countdown(inHours, false), now)).toEqual({
      phase: 'future',
      amount: 5,
      unit: 'hours',
    });
    const inDays = now.getTime() + 4 * 86_400_000;
    expect(countdownState(countdown(inDays, false), now)).toEqual({
      phase: 'future',
      amount: 4,
      unit: 'days',
    });
    const tenPast = now.getTime() - 10 * 60_000;
    expect(countdownState(countdown(tenPast, false), now)).toEqual({
      phase: 'past',
      amount: 10,
      unit: 'minutes',
    });
    expect(countdownState(countdown(now.getTime(), false), now).phase).toBe('now');
  });

  it('stores soonest first, drops junk and caps the list', () => {
    const list = sanitizeCountdowns([
      { id: 'b', label: 'Second', target: Date.UTC(2027, 0, 2), allDay: true },
      { id: 'a', label: 'First', target: Date.UTC(2027, 0, 1), allDay: false },
      { id: 'a', label: 'Duplicate', target: Date.UTC(2027, 0, 3), allDay: true },
      { id: 'c', label: '   ', target: Date.UTC(2027, 0, 4), allDay: true },
      { id: 'd', label: 'Past the range', target: 1, allDay: true },
    ]);
    expect(list.map(item => item.id)).toEqual(['a', 'b']);
    expect(list[0]?.label).toBe('First');
  });

  it('adds in order and removes by id', () => {
    const later = countdown(Date.UTC(2027, 5, 1), true);
    const sooner = countdown(Date.UTC(2027, 4, 1), true);
    const list = addCountdown([later], sooner);
    expect(list.map(item => item.id)).toEqual([sooner.id, later.id]);
    expect(addCountdown(list, sooner)).toBe(list);
    expect(removeCountdown(list, sooner.id).map(item => item.id)).toEqual([later.id]);
    const big = Array.from({ length: MAX_COUNTDOWNS }, (_, index) =>
      countdown(Date.UTC(2027, 0, 1 + index), true),
    );
    expect(addCountdown(big, countdown(Date.UTC(2026, 11, 1), true))).toHaveLength(MAX_COUNTDOWNS);
  });
});
