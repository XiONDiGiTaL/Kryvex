import { useEffect, useState, type FormEvent } from 'react';
import type {
  HomeSettings,
  WellnessActivity,
  WellnessDay,
  WellnessProfile,
  WellnessSex,
  WellnessUnits,
} from '../types';
import { useT } from '../lib/i18n';
import { Icon, Modal } from './ui';
import {
  DEFAULT_BEDTIME,
  DEFAULT_SLEEP_GOAL_MINUTES,
  MAX_CONDITIONS,
  MAX_SLEEP_GOAL_MINUTES,
  MAX_WATER_GOAL_ML,
  MIN_SLEEP_GOAL_MINUTES,
  MIN_WATER_GOAL_ML,
  WATER_STEP_ML,
  bmi,
  bmiBand,
  dailyCalorieTarget,
  dailyTask,
  dayKey,
  findDay,
  formatSleep,
  levelFor,
  minutesUntilBedtime,
  streak,
  suggestedWaterGoal,
  totalXp,
  waterBehind,
  withDay,
} from '../lib/wellness';

const LB_PER_KG = 2.204_622_621_8;
const CM_PER_INCH = 2.54;

type DayPatch = Partial<Omit<WellnessDay, 'date'>>;

const BAND_LABEL: Record<ReturnType<typeof bmiBand>, string> = {
  under: 'Under',
  healthy: 'Healthy',
  elevated: 'Elevated',
  high: 'High',
};

interface Draft {
  units: WellnessUnits;
  height: string;
  weight: string;
  birthYear: string;
  sex: WellnessSex;
  activity: WellnessActivity;
  conditions: string;
  waterGoal: string;
  sleepGoal: string;
  bedtime: string;
  remindWater: boolean;
  remindSleep: boolean;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Metric is the stored unit; the form only converts for display and input. */
function toDisplayWeight(kg: number | null, units: WellnessUnits): string {
  if (!kg) return '';
  return `${round1(units === 'imperial' ? kg * LB_PER_KG : kg)}`;
}

function toDisplayHeight(cm: number | null, units: WellnessUnits): string {
  if (!cm) return '';
  return `${round1(units === 'imperial' ? cm / CM_PER_INCH : cm)}`;
}

function parseNumber(value: string): number | null {
  const number = Number(value.replace(',', '.').trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function draftFrom(home: HomeSettings): Draft {
  const { wellness } = home;
  const { profile } = wellness;
  return {
    units: profile.units,
    height: toDisplayHeight(profile.heightCm, profile.units),
    weight: toDisplayWeight(profile.weightKg, profile.units),
    birthYear: profile.birthYear ? String(profile.birthYear) : '',
    sex: profile.sex,
    activity: profile.activity,
    conditions: profile.conditions,
    waterGoal: String(wellness.waterGoalMl),
    sleepGoal: String(round1(wellness.sleepGoalMinutes / 60)),
    bedtime: wellness.bedtime,
    remindWater: wellness.remindWater,
    remindSleep: wellness.remindSleep,
  };
}

/**
 * The optional wellness widget: water, sleep, one tiny daily task and a level
 * that only ever reflects what was actually logged. The intake form is the only
 * place numbers arrive, and the card never talks to a network.
 */
export function WellnessBoard({
  home,
  open,
  onOpen,
  onClose,
  onUpdate,
}: {
  home: HomeSettings;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onUpdate: (patch: Partial<HomeSettings>) => void;
}) {
  const t = useT();
  const { wellness } = home;
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      return;
    }
    // Seeded once per opening: typing must not be overwritten when the saved
    // settings change underneath the form.
    setDraft(current => current ?? draftFrom(home));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!home.showWellness && !open) return null;

  const now = new Date();
  const today = dayKey(now);
  const day = findDay(wellness.days, today);
  const level = levelFor(totalXp(wellness.days, wellness.waterGoalMl));
  const days = streak(wellness.days, today);
  const task = dailyTask(today);
  const bmiValue = bmi(wellness.profile.weightKg, wellness.profile.heightCm);
  const calorieTarget = dailyCalorieTarget(wellness.profile, now);
  const behind = waterBehind(day, wellness.waterGoalMl, now);
  const bedtime = minutesUntilBedtime(wellness.bedtime, now);
  const metric = wellness.profile.units !== 'imperial';

  const waterPct = Math.min(
    100,
    Math.round(((day?.waterMl ?? 0) / Math.max(1, wellness.waterGoalMl)) * 100),
  );
  const levelPct = level.span > 0 ? Math.round((level.into / level.span) * 100) : 0;

  function save(patch: DayPatch): void {
    onUpdate({ wellness: { ...wellness, days: withDay(wellness.days, today, patch) } });
  }

  function addWater(delta: number): void {
    const next = Math.max(0, Math.min(10_000, (day?.waterMl ?? 0) + delta));
    save({ waterMl: next });
  }

  function logSleep(value: string): void {
    const hours = parseNumber(value);
    if (hours === null) {
      save({ sleepMinutes: 0 });
      return;
    }
    save({ sleepMinutes: Math.round(Math.min(24, hours) * 60) });
  }

  function logWeight(value: string): void {
    const entered = parseNumber(value);
    if (entered === null) {
      save({ weightKg: null });
      return;
    }
    const kg = round1(Math.min(400, Math.max(25, metric ? entered : entered / LB_PER_KG)));
    save({ weightKg: kg });
    // The first weigh-in also becomes the profile weight the estimates use.
    if (!wellness.profile.weightKg) {
      onUpdate({
        wellness: { ...wellness, profile: { ...wellness.profile, weightKg: kg } },
      });
    }
  }

  function logCalories(value: string): void {
    const entered = parseNumber(value);
    save({ calories: entered === null ? null : Math.round(Math.min(10_000, entered)) });
  }

  function saveProfile(event: FormEvent): void {
    event.preventDefault();
    if (!draft) return;

    const heightEntered = parseNumber(draft.height);
    const weightEntered = parseNumber(draft.weight);
    const birthEntered = parseNumber(draft.birthYear);
    const heightCm = heightEntered
      ? Math.min(
          250,
          Math.max(90, draft.units === 'imperial' ? heightEntered * CM_PER_INCH : heightEntered),
        )
      : null;
    const weightKg = weightEntered
      ? Math.min(
          400,
          Math.max(25, draft.units === 'imperial' ? weightEntered / LB_PER_KG : weightEntered),
        )
      : null;
    const profile: WellnessProfile = {
      units: draft.units,
      heightCm: heightCm === null ? null : round1(heightCm),
      weightKg: weightKg === null ? null : round1(weightKg),
      birthYear: birthEntered ? Math.round(birthEntered) : null,
      sex: draft.sex,
      activity: draft.activity,
      conditions: draft.conditions.slice(0, MAX_CONDITIONS),
    };
    const waterGoal = parseNumber(draft.waterGoal);
    const sleepHours = parseNumber(draft.sleepGoal);

    onUpdate({
      showWellness: true,
      wellness: {
        ...wellness,
        onboarded: true,
        enabled: true,
        profile,
        waterGoalMl: waterGoal
          ? Math.min(MAX_WATER_GOAL_ML, Math.max(MIN_WATER_GOAL_ML, Math.round(waterGoal)))
          : suggestedWaterGoal(profile.weightKg),
        sleepGoalMinutes: sleepHours
          ? Math.min(
              MAX_SLEEP_GOAL_MINUTES,
              Math.max(MIN_SLEEP_GOAL_MINUTES, Math.round(sleepHours * 60)),
            )
          : DEFAULT_SLEEP_GOAL_MINUTES,
        bedtime: draft.bedtime || DEFAULT_BEDTIME,
        remindWater: draft.remindWater,
        remindSleep: draft.remindSleep,
      },
    });
    onClose();
  }

  const band = bmiValue === null ? null : bmiBand(bmiValue);

  return (
    <section className="wellness" aria-label={t('Wellness')}>
      <div className="wellness-head">
        <div className="wellness-title">
          <span className="wellness-heart" aria-hidden="true">
            <Icon name="heart" size={15} />
          </span>
          <span className="mono">{t('WELLNESS')}</span>
          {wellness.onboarded ? (
            <span className="wellness-level-chip mono">
              {t('LVL {level} · {title}', { level: level.level, title: t(level.title) })}
            </span>
          ) : null}
        </div>
        <button className="link" onClick={onOpen}>
          {wellness.onboarded ? t('Edit details') : t('Set up')}
        </button>
      </div>

      {!wellness.onboarded ? (
        <div className="wellness-intro">
          <p>
            {t(
              'Water, sleep and one small daily task, tracked only if you ask. Nothing here leaves this file.',
            )}
          </p>
          <button className="btn secondary small" onClick={onOpen}>
            <Icon name="heart" size={13} />
            {t('Set up')}
          </button>
        </div>
      ) : (
        <>
          <div className="wellness-levelbar">
            <div className="wellness-level-copy">
              <strong>
                {t('Level {level} · {title}', { level: level.level, title: t(level.title) })}
              </strong>
              <span className="mono">
                {t('{into} / {span} XP', { into: level.into, span: level.span })}
              </span>
            </div>
            <div className="wellness-bar is-xp">
              <span style={{ width: `${levelPct}%` }} />
            </div>
            <div className="wellness-meta">
              <span>{days > 0 ? t('{count}-day streak', { count: days }) : t('No streak yet')}</span>
              <span className="mono">{t('{total} XP', { total: level.xp })}</span>
            </div>
          </div>

          <div className="wellness-grid">
            <div className="wellness-tile">
              <span className="wellness-tile-label">
                <Icon name="droplet" size={13} /> {t('Water')}
              </span>
              <strong>
                {t('{logged} / {goal} ml', {
                  logged: day?.waterMl ?? 0,
                  goal: wellness.waterGoalMl,
                })}
              </strong>
              <div className="wellness-bar">
                <span style={{ width: `${waterPct}%` }} />
              </div>
              <div className="wellness-actions">
                <button
                  className="chip-btn"
                  onClick={() => addWater(-WATER_STEP_ML)}
                  aria-label={t('Remove 250 ml')}
                  disabled={(day?.waterMl ?? 0) === 0}
                >
                  −
                </button>
                <button
                  className="chip-btn is-active"
                  onClick={() => addWater(WATER_STEP_ML)}
                  aria-label={t('Add 250 ml')}
                >
                  + {t('250 ml')}
                </button>
              </div>
              {wellness.remindWater && behind ? (
                <span className="wellness-nudge">{t('Time for water.')}</span>
              ) : null}
            </div>

            <div className="wellness-tile">
              <span className="wellness-tile-label">
                <Icon name="moon" size={13} /> {t('Sleep')}
              </span>
              <strong>{formatSleep(day?.sleepMinutes ?? 0) || t('Not logged')}</strong>
              <label className="wellness-field">
                <span>{t('Hours slept')}</span>
                <input
                  key={`sleep-${day?.sleepMinutes ?? 0}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={24}
                  step={0.5}
                  defaultValue={day?.sleepMinutes ? round1(day.sleepMinutes / 60) : ''}
                  onBlur={event => logSleep(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
              </label>
              <span className="wellness-meta-line mono">
                {t('Bedtime {time}', { time: wellness.bedtime })}
                {wellness.remindSleep && Number.isFinite(bedtime) && bedtime <= 720 && bedtime > -120
                  ? ` · ${bedtime > 0 ? t('in {minutes} min', { minutes: bedtime }) : t('now')}`
                  : ''}
              </span>
            </div>

            <div className="wellness-tile">
              <span className="wellness-tile-label">
                <Icon name="spark" size={13} /> {t('Tiny task')}
              </span>
              <strong>{t(task)}</strong>
              <div className="wellness-actions">
                <button
                  className={`chip-btn ${day?.taskDone ? 'is-active' : ''}`}
                  aria-pressed={day?.taskDone === true}
                  onClick={() => save({ taskDone: !day?.taskDone })}
                >
                  {day?.taskDone ? (
                    <>
                      <Icon name="check" size={11} /> {t('Done')}
                    </>
                  ) : (
                    t('Mark done')
                  )}
                </button>
              </div>
              <span className="wellness-meta-line mono">{t('One a day, chosen by the date.')}</span>
            </div>
          </div>

          <div className="wellness-metrics">
            <div>
              <span className="mono">{t('BMI')}</span>
              <strong>{bmiValue === null ? '—' : bmiValue}</strong>
              <span>{band ? t(BAND_LABEL[band]) : t('Add height and weight')}</span>
            </div>
            <div>
              <span className="mono">{t('Daily target')}</span>
              <strong>{calorieTarget === null ? '—' : t('{value} kcal', { value: calorieTarget })}</strong>
              <span>{t('Activity estimate')}</span>
            </div>
            <label className="wellness-field">
              <span>{t('Weight today ({unit})', { unit: metric ? 'kg' : 'lb' })}</span>
              <input
                key={`weight-${day?.weightKg ?? wellness.profile.weightKg ?? 'none'}`}
                type="number"
                inputMode="decimal"
                min={metric ? 25 : 55}
                max={metric ? 400 : 880}
                step={0.1}
                defaultValue={toDisplayWeight(
                  day?.weightKg ?? wellness.profile.weightKg,
                  wellness.profile.units,
                )}
                onBlur={event => logWeight(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </label>
            <label className="wellness-field">
              <span>{t('Calories today')}</span>
              <input
                key={`kcal-${day?.calories ?? 'none'}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={10_000}
                defaultValue={day?.calories ?? ''}
                onBlur={event => logCalories(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </label>
            <button
              className={`btn small ${day?.checkedIn ? 'secondary' : 'primary'}`}
              onClick={() => save({ checkedIn: true })}
              disabled={day?.checkedIn === true}
            >
              {day?.checkedIn ? t('Checked in') : t('Check in')}
            </button>
          </div>

          <p className="wellness-note">
            {t('Estimates only, not medical advice. Everything stays in this file.')}
          </p>
        </>
      )}

      {open && draft ? (
        <Modal
          title={t('Wellness details')}
          subtitle={t('Every field is optional, and all of it stays on this machine.')}
          width={560}
          onClose={onClose}
          footer={
            <>
              <button className="btn secondary" onClick={onClose}>
                {t('Cancel')}
              </button>
              <button className="btn primary" type="submit" form="wellness-form">
                {t('Save and start tracking')}
              </button>
            </>
          }
        >
          <form id="wellness-form" className="wellness-form" onSubmit={saveProfile}>
            <div className="wellness-form-row">
              <span className="wellness-form-label">{t('Units')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('Units')}>
                {(['metric', 'imperial'] as const).map(units => (
                  <button
                    key={units}
                    type="button"
                    role="radio"
                    aria-checked={draft.units === units}
                    className={draft.units === units ? 'is-active' : ''}
                    onClick={() => setDraft(value => value && { ...value, units })}
                  >
                    {units === 'metric' ? t('Metric') : t('Imperial')}
                  </button>
                ))}
              </div>
            </div>

            <div className="wellness-form-cols">
              <label className="wellness-field">
                <span>{t('Height ({unit})', { unit: draft.units === 'imperial' ? 'in' : 'cm' })}</span>
                <input
                  value={draft.height}
                  onChange={event =>
                    setDraft(value => value && { ...value, height: event.target.value })
                  }
                  inputMode="decimal"
                  placeholder={draft.units === 'imperial' ? '69' : '175'}
                />
              </label>
              <label className="wellness-field">
                <span>{t('Weight ({unit})', { unit: draft.units === 'imperial' ? 'lb' : 'kg' })}</span>
                <input
                  value={draft.weight}
                  onChange={event =>
                    setDraft(value => value && { ...value, weight: event.target.value })
                  }
                  inputMode="decimal"
                  placeholder={draft.units === 'imperial' ? '160' : '72'}
                />
              </label>
              <label className="wellness-field">
                <span>{t('Birth year')}</span>
                <input
                  value={draft.birthYear}
                  onChange={event =>
                    setDraft(value => value && { ...value, birthYear: event.target.value })
                  }
                  inputMode="numeric"
                  placeholder="1996"
                />
              </label>
            </div>

            <div className="wellness-form-row">
              <span className="wellness-form-label">{t('Activity')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('Activity')}>
                {(
                  [
                    ['low', 'Low'],
                    ['light', 'Light'],
                    ['moderate', 'Moderate'],
                    ['high', 'High'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={draft.activity === id}
                    className={draft.activity === id ? 'is-active' : ''}
                    onClick={() => setDraft(value => value && { ...value, activity: id })}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="wellness-form-row">
              <span className="wellness-form-label">{t('Biological sex')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('Biological sex')}>
                {(
                  [
                    ['female', 'Female'],
                    ['male', 'Male'],
                    ['unspecified', 'Prefer not to say'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={draft.sex === id}
                    className={draft.sex === id ? 'is-active' : ''}
                    onClick={() => setDraft(value => value && { ...value, sex: id })}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>

            <label className="wellness-field">
              <span>{t('Anything you want to track (optional)')}</span>
              <input
                value={draft.conditions}
                onChange={event =>
                  setDraft(value => value && { ...value, conditions: event.target.value })
                }
                maxLength={MAX_CONDITIONS}
                placeholder={t('Sleep, posture, a note to yourself')}
              />
            </label>

            <div className="wellness-form-cols">
              <label className="wellness-field">
                <span>{t('Water goal (ml)')}</span>
                <input
                  value={draft.waterGoal}
                  onChange={event =>
                    setDraft(value => value && { ...value, waterGoal: event.target.value })
                  }
                  inputMode="numeric"
                />
              </label>
              <label className="wellness-field">
                <span>{t('Sleep goal (hours)')}</span>
                <input
                  value={draft.sleepGoal}
                  onChange={event =>
                    setDraft(value => value && { ...value, sleepGoal: event.target.value })
                  }
                  inputMode="decimal"
                />
              </label>
              <label className="wellness-field">
                <span>{t('Bedtime')}</span>
                <input
                  type="time"
                  value={draft.bedtime}
                  onChange={event =>
                    setDraft(value => value && { ...value, bedtime: event.target.value })
                  }
                />
              </label>
            </div>

            <button
              type="button"
              className="link wellness-suggest"
              onClick={() =>
                setDraft(value => {
                  if (!value) return value;
                  const weight = parseNumber(value.weight);
                  if (weight === null) return value;
                  const kg = value.units === 'imperial' ? weight / LB_PER_KG : weight;
                  return { ...value, waterGoal: String(suggestedWaterGoal(kg)) };
                })
              }
            >
              {t('Use the suggested water goal')}
            </button>

            <div className="wellness-switches">
              <label className="wellness-switch">
                <span>{t('Remind me to drink water')}</span>
                <input
                  type="checkbox"
                  checked={draft.remindWater}
                  onChange={event =>
                    setDraft(value => value && { ...value, remindWater: event.target.checked })
                  }
                />
              </label>
              <label className="wellness-switch">
                <span>{t('Remind me before bedtime')}</span>
                <input
                  type="checkbox"
                  checked={draft.remindSleep}
                  onChange={event =>
                    setDraft(value => value && { ...value, remindSleep: event.target.checked })
                  }
                />
              </label>
            </div>

            <p className="wellness-note">
              {t('Estimates only, not medical advice. Everything stays in this file.')}
            </p>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
