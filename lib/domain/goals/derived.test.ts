import { describe, expect, it } from 'vitest';
import type { Profile } from '../profile.ts';
import { derivedGoal } from './derived.ts';

const female: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};

describe('derivedGoal', () => {
  it('turns the profile, weight, date and settings into a goal vector', () => {
    const goal = derivedGoal(female, 65, '2026-10-20', {
      weeklyRateKg: -0.5,
      proteinGPerKg: 1.8,
      fatEnergyShare: 0.3,
    });

    expect(goal.bmr).toBe(1359);
    expect(goal.tdee).toBeCloseTo(2106.45);
    expect(Object.keys(goal.nutrients).sort()).toEqual([
      'carbohydrate',
      'energy_kcal',
      'fat',
      'fibre',
      'protein',
    ]);
    expect(goal.nutrients.energy_kcal).toBeCloseTo(1556.45);
    expect(goal.nutrients.protein).toBeCloseTo(117);
    expect(goal.nutrients.fat).toBeCloseTo((1556.45 * 0.3) / 9);
    expect(goal.nutrients.carbohydrate).toBeCloseTo(
      (1556.45 - 117 * 4 - 1556.45 * 0.3) / 4,
    );
    expect(goal.nutrients.fibre).toBeCloseTo(1556.45 * 0.014);
    expect(goal.warnings).toEqual([]);
  });

  it('collects the energy and the macro warnings together', () => {
    const goal = derivedGoal(female, 65, '2026-10-20', {
      weeklyRateKg: -1.5,
      proteinGPerKg: 2.5,
      fatEnergyShare: 0.4,
    });

    expect(goal.nutrients.carbohydrate).toBe(0);
    expect(goal.warnings).toEqual([
      'energy_below_minimum',
      'rate_above_maximum',
      'carbohydrate_floored',
    ]);
  });
});
