import { describe, expect, it } from 'vitest';
import type { Profile } from '../profile.ts';
import { bmr, energyGoal, energyWarnings, kcalTarget, tdee } from './energy.ts';

const today = '2026-10-20';

const female: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};

const male: Profile = {
  sex: 'male',
  birthDate: '1985-03-01',
  heightCm: 180,
  activityLevel: 'sedentary',
};

describe('bmr', () => {
  it('is Mifflin-St Jeor for a woman: 10 × kg + 6.25 × cm − 5 × age − 161', () => {
    expect(bmr(female, 65, today)).toBe(650 + 1050 - 180 - 161);
  });

  it('is Mifflin-St Jeor for a man: 10 × kg + 6.25 × cm − 5 × age + 5', () => {
    expect(bmr(male, 80, today)).toBe(800 + 1125 - 205 + 5);
  });

  it('takes the age on the date it is computed for', () => {
    const birthdayTomorrow = { ...female, birthDate: '1990-10-21' };

    expect(bmr(birthdayTomorrow, 65, today)).toBe(1364);
    expect(bmr(birthdayTomorrow, 65, '2026-10-21')).toBe(1359);
  });
});

describe('tdee', () => {
  it('multiplies BMR by the activity level', () => {
    expect(tdee(1359, 'moderate')).toBeCloseTo(2106.45);
    expect(tdee(1725, 'sedentary')).toBeCloseTo(2070);
    expect(tdee(1725, 'very_active')).toBeCloseTo(3277.5);
  });
});

describe('kcalTarget', () => {
  it('is TDEE when the weekly rate is zero', () => {
    expect(kcalTarget(2070, 0)).toBe(2070);
  });

  it('takes 7,700 kcal per kg off TDEE, spread over the week, to lose', () => {
    expect(kcalTarget(2070, -0.5)).toBe(1520);
    expect(kcalTarget(2070, -1)).toBe(970);
  });

  it('adds 7,700 kcal per kg to TDEE, spread over the week, to gain', () => {
    expect(kcalTarget(2070, 0.25)).toBe(2345);
  });
});

describe('energyWarnings', () => {
  it('warns when a woman’s target drops under 1,200 kcal', () => {
    expect(energyWarnings('female', 1199.5, 0)).toEqual([
      'energy_below_minimum',
    ]);
    expect(energyWarnings('female', 1200, 0)).toEqual([]);
  });

  it('warns when a man’s target drops under 1,500 kcal', () => {
    expect(energyWarnings('male', 1499.5, 0)).toEqual(['energy_below_minimum']);
    expect(energyWarnings('male', 1500, 0)).toEqual([]);
    expect(energyWarnings('female', 1499.5, 0)).toEqual([]);
  });

  it('warns when the rate exceeds 1 kg a week, losing or gaining', () => {
    expect(energyWarnings('male', 2000, -1.1)).toEqual(['rate_above_maximum']);
    expect(energyWarnings('male', 3000, 1.25)).toEqual(['rate_above_maximum']);
    expect(energyWarnings('male', 2000, -1)).toEqual([]);
    expect(energyWarnings('male', 3000, 1)).toEqual([]);
  });

  it('gives both warnings when both apply', () => {
    expect(energyWarnings('female', 900, -1.5)).toEqual([
      'energy_below_minimum',
      'rate_above_maximum',
    ]);
  });
});

describe('energyGoal', () => {
  it('derives BMR, TDEE and the kcal target from the profile, weight, date and rate', () => {
    const goal = energyGoal(female, 65, today, -0.5);

    expect(goal.bmr).toBe(1359);
    expect(goal.tdee).toBeCloseTo(2106.45);
    expect(goal.kcal).toBeCloseTo(1556.45);
    expect(goal.warnings).toEqual([]);
  });

  it('warns about the target it derives, and still derives it', () => {
    const goal = energyGoal(female, 65, today, -1);

    expect(goal.kcal).toBeCloseTo(1006.45);
    expect(goal.warnings).toEqual(['energy_below_minimum']);
  });
});
