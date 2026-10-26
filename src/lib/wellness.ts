/**
 * Wellness rules: everything the optional Home widget can decide without a DOM
 * or a network.
 *
 * The widget is off until someone fills in the intake form, and every number it
 * shows is either entered by that person or derived from those entries here.
 * Nothing is fetched, and no estimate is presented as advice.
 */
import type { WellnessActivity, WellnessDay, WellnessProfile } from '../types';

export const MAX_WELLNESS_DAYS = 90;
export const MAX_CONDITIONS = 160;
export const WATER_STEP_ML = 250;
export const DEFAULT_WATER_GOAL_ML = 2000;
export const DEFAULT_SLEEP_GOAL_MINUTES = 480;
export const DEFAULT_BEDTIME = '23:00';
export const MIN_WATER_GOAL_ML = 500;
export const MAX_WATER_GOAL_ML = 6000;
export const MIN_SLEEP_GOAL_MINUTES = 240;
export const MAX_SLEEP_GOAL_MINUTES = 840;

/** XP is derived from the log rather than stored, so it cannot double-count. */
export const XP_CHECK_IN = 8;
export const XP_WATER = 12;
export const XP_SLEEP = 8;
export const XP_TASK = 10;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Local calendar day; the log is written where the user lives, not in UTC. */
export function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A real calendar day, not just the shape: 2027-02-31 is rejected. */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isBedtime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

export function emptyDay(date: string): WellnessDay {
  return {
    date,
    waterMl: 0,
    sleepMinutes: 0,
    weightKg: null,
    calories: null,
    taskDone: false,
    checkedIn: false,
  };
}

export function findDay(days: WellnessDay[], date: string): WellnessDay | undefined {
  return days.find(day => day.date === date);
}

/**
 * Returns the log with one day replaced or appended, oldest first and trimmed to
 * the cap. The caller never needs to know whether the day already existed.
 */
export function withDay(
  days: WellnessDay[],
  date: string,
  patch: Partial<Omit<WellnessDay, 'date'>>,
): WellnessDay[] {
  const existing = findDay(days, date);
  const next = existing
    ? days.map(day => (day.date === date ? { ...day, ...patch } : day))
    : [...days, { ...emptyDay(date), ...patch }];
  return next
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_WELLNESS_DAYS);
}

export type BmiBand = 'under' | 'healthy' | 'elevated' | 'high';

/** One decimal, or null when either measurement is missing. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const metres = heightCm / 100;
  if (metres <= 0) return null;
  const value = weightKg / (metres * metres);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

export function bmiBand(value: number): BmiBand {
  if (value < 18.5) return 'under';
  if (value < 25) return 'healthy';
  if (value < 30) return 'elevated';
  return 'high';
}

const ACTIVITY_FACTOR: Record<WellnessActivity, number> = {
  low: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

/** Whole years, clamped to a range the estimate is meaningful in. */
export function ageFrom(birthYear: number | null, now: Date = new Date()): number | null {
  if (!birthYear) return null;
  const age = now.getFullYear() - birthYear;
  if (age < 14 || age > 100) return null;
  return age;
}

/**
 * Mifflin-St Jeor. The sex offsets differ by 166 kcal, so an unspecified answer
 * uses their midpoint instead of silently assuming one: the result stays an
 * estimate, which is why the card calls it one and carries a disclaimer.
 */
export function basalCalories(profile: WellnessProfile, now: Date = new Date()): number | null {
  const age = ageFrom(profile.birthYear, now);
  const { weightKg, heightCm } = profile;
  if (!age || !weightKg || !heightCm) return null;
  const offset = profile.sex === 'male' ? 5 : profile.sex === 'female' ? -161 : -78;
  const value = 10 * weightKg + 6.25 * heightCm - 5 * age + offset;
  return value > 0 ? Math.round(value) : null;
}

/** Rounded to 10 kcal so the target reads as an estimate, not a prescription. */
export function dailyCalorieTarget(profile: WellnessProfile, now: Date = new Date()): number | null {
  const basal = basalCalories(profile, now);
  if (basal === null) return null;
  return Math.round((basal * ACTIVITY_FACTOR[profile.activity]) / 10) * 10;
}

/** 33 ml per kg, rounded to a 50 ml step and kept inside sane values. */
export function suggestedWaterGoal(weightKg: number | null): number {
  if (!weightKg) return DEFAULT_WATER_GOAL_ML;
  const raw = Math.round((weightKg * 33) / 50) * 50;
  return Math.min(MAX_WATER_GOAL_ML, Math.max(MIN_WATER_GOAL_ML, raw));
}

export function dayXp(day: WellnessDay, waterGoalMl: number): number {
  let xp = 0;
  if (day.checkedIn) xp += XP_CHECK_IN;
  if (waterGoalMl > 0 && day.waterMl >= waterGoalMl) xp += XP_WATER;
  if (day.sleepMinutes > 0) xp += XP_SLEEP;
  if (day.taskDone) xp += XP_TASK;
  return xp;
}

export function totalXp(days: WellnessDay[], waterGoalMl: number): number {
  return days.reduce((sum, day) => sum + dayXp(day, waterGoalMl), 0);
}

export const MAX_LEVEL = 10;

const LEVEL_TITLES = [
  'Start',
  'Sprout',
  'Steady',
  'Builder',
  'Anchor',
  'Pulse',
  'Momentum',
  'Vital',
  'Ironwood',
  'Evergreen',
] as const;

/** Total XP needed to have reached `level`; level 1 starts at zero. */
export function levelXp(level: number): number {
  const reached = Math.max(1, Math.floor(level));
  if (reached <= 1) return 0;
  return (100 * (reached - 1) * reached) / 2;
}

export interface WellnessLevel {
  level: number;
  title: string;
  xp: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
}

export function levelFor(xp: number): WellnessLevel {
  const safe = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  while (level < MAX_LEVEL && safe >= levelXp(level + 1)) level += 1;
  const floor = levelXp(level);
  const ceiling = levelXp(level + 1);
  const span = ceiling - floor;
  const capped = level === MAX_LEVEL;
  return {
    level,
    title: LEVEL_TITLES[level - 1] ?? LEVEL_TITLES[LEVEL_TITLES.length - 1]!,
    xp: safe,
    into: capped ? span : Math.min(span, safe - floor),
    span,
  };
}

/**
 * Consecutive checked-in days ending today, or yesterday while today is still
 * unlogged: a streak is not broken by a day that has not finished yet.
 */
export function streak(days: WellnessDay[], today: string): number {
  const done = new Set(days.filter(day => day.checkedIn).map(day => day.date));
  const cursor = new Date(`${today}T00:00:00`);
  if (!done.has(today)) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (done.has(dayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
    if (count > MAX_WELLNESS_DAYS) break;
  }
  return count;
}

/** One suggestion a day, stable for that date and the same for everyone. */
export const DAILY_TASKS = [
  'Ten push-ups',
  'A ten-minute walk',
  'Twenty squats',
  'Two minutes of stretching',
  'A minute of shoulder rolls',
  'Stand up and breathe for two minutes',
  'Two flights of stairs',
  'A thirty-second plank',
] as const;

export type DailyTask = (typeof DAILY_TASKS)[number];

export function dailyTask(date: string): DailyTask {
  let hash = 0;
  for (const char of date) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return DAILY_TASKS[hash % DAILY_TASKS.length] as DailyTask;
}

/** How much of the 07:00–22:00 waking day has passed, 0 to 1. */
export function waterPace(now: Date): number {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return Math.min(1, Math.max(0, (minutes - 7 * 60) / (15 * 60)));
}

/** How long a logged glass keeps the reminder quiet. */
export const WATER_NUDGE_QUIET_MS = 90 * 60 * 1000;

/**
 * True when the day's intake is more than one glass behind the pace the clock
 * implies, which is the only time the widget nudges.
 *
 * A glass drunk a moment ago silences the reminder for a while: a nudge that
 * stays on screen after the user has just acted on it reads as a bug, not as a
 * reminder. It returns once the quiet window has passed and the pace says the
 * user has fallen behind again.
 */
export function waterBehind(day: WellnessDay | undefined, waterGoalMl: number, now: Date): boolean {
  if (!day || waterGoalMl <= 0) return false;
  if (day.waterAt && now.getTime() - day.waterAt < WATER_NUDGE_QUIET_MS) return false;
  const pace = waterPace(now);
  if (pace <= 0 || pace >= 1) return false;
  return day.waterMl < Math.round(waterGoalMl * pace) - WATER_STEP_ML;
}

/**
 * Minutes to the nearest occurrence of the bedtime: positive before it,
 * negative once it has passed, chosen from today or the adjacent day so 00:30
 * reads as 90 minutes past a 23:00 bedtime rather than 22 hours before it.
 */
export function minutesUntilBedtime(bedtime: string, now: Date): number {
  if (!isBedtime(bedtime)) return Number.NaN;
  const [hours, minutes] = bedtime.split(':').map(Number) as [number, number];
  const target = hours * 60 + minutes;
  const current = now.getHours() * 60 + now.getMinutes();
  let diff = target - current;
  while (diff > 12 * 60) diff -= 24 * 60;
  while (diff < -12 * 60) diff += 24 * 60;
  return diff;
}

export function sleepDue(bedtime: string, now: Date): boolean {
  const minutes = minutesUntilBedtime(bedtime, now);
  if (!Number.isFinite(minutes)) return false;
  return minutes <= 30 && minutes > -120;
}

/** "7h 30m" for a stored minute count; empty when nothing was logged. */
export function formatSleep(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
