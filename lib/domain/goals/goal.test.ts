import { describe, expect, it } from 'vitest';
import type { Profile } from '../profile.ts';
import { derivedGoal } from './derived.ts';
import { defaultMicroGoals } from './drv.ts';
import { goalOn, goalsOn } from './goal.ts';
import { defaultGoalSettings, type GoalSettings } from './settings.ts';

const date = '2026-10-20';

const female: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};

const derived: GoalSettings = {
  mode: 'derived',
  weeklyRateKg: -0.5,
  proteinGPerKg: 1.8,
  fatEnergyShare: 0.3,
  overrides: {},
};

const manual: GoalSettings = {
  ...derived,
  mode: 'manual',
  overrides: { energy_kcal: 2000, protein: 150, fat: 70, carbohydrate: 190 },
};

describe('goalOn', () => {
  it('derives energy and macros from the weight, over the micro defaults at the derived kcal', () => {
    const { bmr, tdee, kcal, nutrients, warnings } = derivedGoal(
      female,
      65,
      date,
      derived,
    );

    expect(goalOn(female, 65, date, derived)).toEqual({
      mode: 'derived',
      weightKg: 65,
      bmr,
      tdee,
      nutrients: { ...defaultMicroGoals(female, date, kcal), ...nutrients },
      warnings,
    });
  });

  it('takes fibre from the derived goal, not the reference value', () => {
    expect(goalOn(female, 65, date, derived)?.nutrients.fibre).toBeCloseTo(
      1556.45 * 0.014,
    );
  });

  it('lets an override win over the derived value for that nutrient only', () => {
    const plain = goalOn(female, 65, date, derived);
    const overridden = goalOn(female, 65, date, {
      ...derived,
      overrides: { protein: 140, iron: 18 },
    });

    expect(overridden?.nutrients).toEqual({
      ...plain?.nutrients,
      protein: 140,
      iron: 18,
    });
  });

  it('has no derived goal without a weight', () => {
    expect(goalOn(female, null, date, derived)).toBeNull();
  });

  it('returns the manual targets over the micro defaults at the manual kcal, without a weight', () => {
    expect(goalOn(female, null, date, manual)).toEqual({
      mode: 'manual',
      weightKg: null,
      bmr: null,
      tdee: null,
      nutrients: {
        ...defaultMicroGoals(female, date, 2000),
        ...manual.overrides,
      },
      warnings: [],
    });
  });

  it('keeps the weight on a manual goal without deriving from it', () => {
    expect(goalOn(female, 65, date, manual)).toMatchObject({
      weightKg: 65,
      bmr: null,
      tdee: null,
      nutrients: { energy_kcal: 2000, protein: 150 },
    });
  });

  it('has no manual goal without an energy target', () => {
    expect(
      goalOn(female, 65, date, { ...manual, overrides: { protein: 150 } }),
    ).toBeNull();
  });

  it('derives from the default settings', () => {
    expect(goalOn(female, 65, date, defaultGoalSettings)).toMatchObject({
      mode: 'derived',
      nutrients: { protein: 1.6 * 65 },
      warnings: [],
    });
  });
});

describe('goalsOn', () => {
  it('is the goal on each date from the latest weight on or before it, whatever order the weights come in', () => {
    const weights = [
      { date: '2026-10-21', value: 64 },
      { date: '2026-10-19', value: 66 },
    ];
    const dates = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'];

    expect(goalsOn(female, weights, dates, derived)).toEqual([
      { date: '2026-10-18', goal: null },
      { date: '2026-10-19', goal: goalOn(female, 66, '2026-10-19', derived) },
      { date: '2026-10-20', goal: goalOn(female, 66, '2026-10-20', derived) },
      { date: '2026-10-21', goal: goalOn(female, 64, '2026-10-21', derived) },
    ]);
  });

  it('has a manual goal on every date, with or without a weight', () => {
    expect(goalsOn(female, [], ['2026-10-20'], manual)).toEqual([
      { date: '2026-10-20', goal: goalOn(female, null, '2026-10-20', manual) },
    ]);
  });
});
