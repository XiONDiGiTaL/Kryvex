import { describe, expect, it } from 'vitest';
import type { WellnessDay, WellnessProfile } from '../src/types';
import { DEFAULT_WELLNESS } from '../src/lib/defaults';
import { sanitizeWellness } from '../src/lib/store';
import { makeI18n } from '../src/lib/i18n';
import {
  DAILY_TASKS,
  MAX_WELLNESS_DAYS,
  bmi,
  bmiBand,
  dailyCalorieTarget,
  dailyTask,
  dayKey,
  dayXp,
  emptyDay,
  formatSleep,
  isDayKey,
  levelFor,
  levelXp,
  minutesUntilBedtime,
  sleepDue,
  streak,
  suggestedWaterGoal,
  totalXp,
  waterBehind,
  withDay,
} from '../src/lib/wellness';

function at(hours: number, minutes = 0): Date {
  return new Date(2026, 9, 22, hours, minutes, 0, 0);
}

function day(date: string, patch: Partial<WellnessDay> = {}): WellnessDay {
  return { ...emptyDay(date), ...patch };
}

const profile: WellnessProfile = {
  units: 'metric',
  heightCm: 180,
  weightKg: 80,
  birthYear: new Date().getFullYear() - 30,
  sex: 'male',
  activity: 'moderate',
  conditions: '',
};

describe('day keys', () => {
  it('are local calendar days, not UTC ones', () => {
    expect(dayKey(new Date(2026, 0, 3, 23, 59))).toBe('2026-01-03');
    expect(dayKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('accept real dates only', () => {
    expect(isDayKey('2026-10-22')).toBe(true);
    expect(isDayKey('2027-02-31')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('2026-1-01')).toBe(false);
    expect(isDayKey(20261022)).toBe(false);
  });
});

describe('body measurements', () => {
  it('derives BMI to one decimal', () => {
    expect(bmi(72, 175)).toBe(23.5);
    expect(bmi(80, 180)).toBe(24.7);
    expect(bmi(null, 180)).toBeNull();
    expect(bmi(80, null)).toBeNull();
  });

  it('bands BMI at the clinical boundaries', () => {
    expect(bmiBand(18.4)).toBe('under');
    expect(bmiBand(18.5)).toBe('healthy');
    expect(bmiBand(24.9)).toBe('healthy');
    expect(bmiBand(25)).toBe('elevated');
    expect(bmiBand(29.9)).toBe('elevated');
    expect(bmiBand(30)).toBe('high');
  });

  it('suggests water at 33 ml per kg, rounded and clamped', () => {
    expect(suggestedWaterGoal(72)).toBe(2400);
    expect(suggestedWaterGoal(40)).toBe(1300);
    expect(suggestedWaterGoal(10)).toBe(500);
    expect(suggestedWaterGoal(200)).toBe(6000);
    expect(suggestedWaterGoal(null)).toBe(2000);
  });

  it('estimates calories from Mifflin-St Jeor before the activity factor', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780 kcal, at 1.55 activity = 2759 → 2760
    expect(dailyCalorieTarget(profile)).toBe(2760);
    // Midpoint offset when sex is not answered, so nothing is assumed.
    expect(
      dailyCalorieTarget({ ...profile, sex: 'unspecified', weightKg: 60, heightCm: 165, activity: 'low' }),
    ).toBe(1680);
    // Missing measurements leave the target unknown rather than guessed.
    expect(dailyCalorieTarget({ ...profile, weightKg: null })).toBeNull();
    expect(dailyCalorieTarget({ ...profile, birthYear: null })).toBeNull();
  });
});

describe('experience and levels', () => {
  it('counts only what was logged', () => {
    expect(dayXp(day('2026-10-22'), 2000)).toBe(0);
    expect(dayXp(day('2026-10-22', { checkedIn: true }), 2000)).toBe(8);
    expect(dayXp(day('2026-10-22', { waterMl: 2000 }), 2000)).toBe(12);
    expect(dayXp(day('2026-10-22', { waterMl: 1999 }), 2000)).toBe(0);
    expect(dayXp(day('2026-10-22', { sleepMinutes: 450 }), 2000)).toBe(8);
    expect(dayXp(day('2026-10-22', { taskDone: true }), 2000)).toBe(10);
    expect(
      dayXp(day('2026-10-22', { checkedIn: true, waterMl: 2000, sleepMinutes: 450, taskDone: true }), 2000),
    ).toBe(38);
  });

  it('accumulates the log rather than storing a separate total', () => {
    const days = [
      day('2026-10-21', { checkedIn: true }),
      day('2026-10-22', { checkedIn: true, taskDone: true }),
    ];
    expect(totalXp(days, 2000)).toBe(26);
  });

  it('steps one level every 100, 200, 300 XP', () => {
    expect(levelXp(1)).toBe(0);
    expect(levelXp(2)).toBe(100);
    expect(levelXp(3)).toBe(300);
    expect(levelXp(4)).toBe(600);

    const first = levelFor(0);
    expect(first.level).toBe(1);
    expect(first.title).toBe('Start');
    expect(first.span).toBe(100);

    const second = levelFor(100);
    expect(second.level).toBe(2);
    expect(second.into).toBe(0);
    expect(second.span).toBe(200);

    expect(levelFor(299).level).toBe(2);
    expect(levelFor(299).into).toBe(199);
    expect(levelFor(300).level).toBe(3);
    expect(levelFor(-5).level).toBe(1);
  });

  it('caps the ladder but keeps the last bar full', () => {
    const top = levelFor(1_000_000);
    expect(top.level).toBe(10);
    expect(top.title).toBe('Evergreen');
    expect(top.into).toBe(top.span);
  });
});

describe('streaks', () => {
  it('counts consecutive checked-in days ending today', () => {
    const days = [
      day('2026-10-20', { checkedIn: true }),
      day('2026-10-21', { checkedIn: true }),
      day('2026-10-22', { checkedIn: true }),
    ];
    expect(streak(days, '2026-10-22')).toBe(3);
  });

  it('does not break a streak because today is still unlogged', () => {
    const days = [
      day('2026-10-20', { checkedIn: true }),
      day('2026-10-21', { checkedIn: true }),
    ];
    expect(streak(days, '2026-10-22')).toBe(2);
  });

  it('stops at the first gap', () => {
    const days = [
      day('2026-10-18', { checkedIn: true }),
      day('2026-10-20', { checkedIn: true }),
      day('2026-10-21', { checkedIn: true }),
    ];
    expect(streak(days, '2026-10-22')).toBe(2);
  });

  it('is zero with nothing logged', () => {
    expect(streak([], '2026-10-22')).toBe(0);
    expect(streak([day('2026-09-01', { checkedIn: true })], '2026-10-22')).toBe(0);
  });
});

describe('the daily task', () => {
  it('is stable for a date and drawn from the pool', () => {
    expect(dailyTask('2026-10-22')).toBe(dailyTask('2026-10-22'));
    expect(DAILY_TASKS).toContain(dailyTask('2026-10-22'));
  });

  it('varies across a fortnight', () => {
    const picks = new Set<string>();
    for (let index = 0; index < 14; index += 1) {
      const date = new Date(2026, 9, 1 + index);
      picks.add(dailyTask(dayKey(date)));
    }
    expect(picks.size).toBeGreaterThan(2);
  });
});

describe('logging a day', () => {
  it('appends a new day and replaces an existing one', () => {
    const first = withDay([], '2026-10-22', { waterMl: 250 });
    expect(first).toHaveLength(1);
    expect(first[0]?.waterMl).toBe(250);

    const second = withDay(first, '2026-10-22', { waterMl: 500 });
    expect(second).toHaveLength(1);
    expect(second[0]?.waterMl).toBe(500);
  });

  it('keeps the log ordered and capped', () => {
    let days: WellnessDay[] = [];
    for (let index = 0; index < MAX_WELLNESS_DAYS + 5; index += 1) {
      const date = new Date(2026, 0, 1 + index);
      days = withDay(days, dayKey(date), { checkedIn: true });
    }
    expect(days).toHaveLength(MAX_WELLNESS_DAYS);
    expect((days[0]?.date ?? '') < (days[days.length - 1]?.date ?? '')).toBe(true);
  });
});

describe('reminder timing', () => {
  it('nudges only when intake is a glass behind the clock', () => {
    // 14:30 is halfway through the waking day: 1000 ml expected of a 2000 goal.
    expect(waterBehind(day('2026-10-22', { waterMl: 500 }), 2000, at(14, 30))).toBe(true);
    expect(waterBehind(day('2026-10-22', { waterMl: 800 }), 2000, at(14, 30))).toBe(false);
    // Outside the waking window it never nags.
    expect(waterBehind(day('2026-10-22', { waterMl: 0 }), 2000, at(6, 0))).toBe(false);
    expect(waterBehind(day('2026-10-22', { waterMl: 0 }), 2000, at(22, 30))).toBe(false);
    expect(waterBehind(undefined, 2000, at(14, 30))).toBe(false);
  });

  it('points at the nearest bedtime, including after midnight', () => {
    expect(minutesUntilBedtime('23:00', at(22, 40))).toBe(20);
    expect(minutesUntilBedtime('23:00', at(0, 30))).toBe(-90);
    expect(minutesUntilBedtime('23:00', at(12, 0))).toBe(660);
    expect(minutesUntilBedtime('nope', at(12, 0))).toBeNaN();
  });

  it('is due in the half hour before and shortly after bedtime', () => {
    expect(sleepDue('23:00', at(22, 40))).toBe(true);
    expect(sleepDue('23:00', at(22, 0))).toBe(false);
    expect(sleepDue('23:00', at(23, 30))).toBe(true);
    expect(sleepDue('23:00', at(3, 0))).toBe(false);
  });
});

describe('formatting', () => {
  it('reads a minute count back as hours', () => {
    expect(formatSleep(450)).toBe('7h 30m');
    expect(formatSleep(480)).toBe('8h');
    expect(formatSleep(0)).toBe('');
  });
});

describe('stored wellness state', () => {
  it('is off until the intake form was completed', () => {
    const fresh = sanitizeWellness(undefined);
    expect(fresh.enabled).toBe(false);
    expect(fresh.onboarded).toBe(false);
    expect(fresh.days).toEqual([]);
    expect(fresh.profile.units).toBe('metric');

    // A stored `enabled: true` without an intake still cannot show the widget.
    const odd = sanitizeWellness({ enabled: true });
    expect(odd.enabled).toBe(false);
    expect(odd.onboarded).toBe(false);
  });

  it('clamps measurements and goals instead of trusting the file', () => {
    const value = sanitizeWellness({
      onboarded: true,
      enabled: true,
      profile: { heightCm: 12, weightKg: 9999, birthYear: 1200, activity: 'extreme', sex: 'other' },
      waterGoalMl: 99_999,
      sleepGoalMinutes: 5,
      bedtime: '25:99',
    });
    expect(value.profile.heightCm).toBeNull();
    expect(value.profile.weightKg).toBeNull();
    expect(value.profile.birthYear).toBeNull();
    expect(value.profile.activity).toBe('light');
    expect(value.profile.sex).toBe('unspecified');
    expect(value.waterGoalMl).toBe(6000);
    // Goals clamp to the nearest allowed value instead of resetting to default.
    expect(value.sleepGoalMinutes).toBe(240);
    expect(value.bedtime).toBe(DEFAULT_WELLNESS.bedtime);
  });

  it('keeps real days, drops impossible ones and de-duplicates', () => {
    const value = sanitizeWellness({
      onboarded: true,
      days: [
        { date: '2027-02-31', waterMl: 500 },
        { date: '2026-10-21', waterMl: 250, sleepMinutes: 400, checkedIn: true },
        { date: '2026-10-21', waterMl: 750, taskDone: true },
        { date: '2026-10-22', waterMl: -50, calories: 999_999 },
        'not a day',
      ],
    });
    expect(value.days.map(entry => entry.date)).toEqual(['2026-10-21', '2026-10-22']);
    // A later duplicate replaces the earlier one rather than merging into it.
    expect(value.days[0]?.waterMl).toBe(750);
    expect(value.days[0]?.taskDone).toBe(true);
    expect(value.days[0]?.checkedIn).toBe(false);
    expect(value.days[1]?.waterMl).toBe(0);
    expect(value.days[1]?.calories).toBeNull();
  });

  it('keeps the noted conditions as text and nothing else', () => {
    const value = sanitizeWellness({
      onboarded: true,
      profile: { conditions: `  knees\u0000 ok  ${'x'.repeat(400)}` },
    });
    expect(value.profile.conditions.startsWith('knees')).toBe(true);
    expect(value.profile.conditions.length).toBeLessThanOrEqual(160);
  });
});

describe('wellness copy', () => {
  it('translates the card, the intake form and the daily tasks', () => {
    expect(makeI18n('es').t('Wellness')).toBe('Bienestar');
    expect(makeI18n('de').t('Check in')).toBe('Heute erfassen');
    expect(makeI18n('fr').t('Ten push-ups')).toBe('Dix pompes');
    expect(makeI18n('de').t('Ten push-ups')).toBe('Zehn Liegestütze');
    // Every daily task key must exist in every catalogue, or the card falls
    // back to English mid-sentence.
    for (const language of ['es', 'de', 'fr'] as const) {
      for (const task of DAILY_TASKS) {
        expect(makeI18n(language).t(task)).not.toBe(task);
      }
    }
  });
});
