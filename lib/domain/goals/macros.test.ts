import { describe, expect, it } from 'vitest';
import { macroGoal } from './macros.ts';

describe('macroGoal', () => {
  it('sets protein by body weight, fat by share of energy and carbohydrate as the rest', () => {
    const goal = macroGoal(2000, 80, {
      proteinGPerKg: 1.6,
      fatEnergyShare: 0.3,
    });

    expect(goal.protein).toBeCloseTo(128);
    expect(goal.fat).toBeCloseTo(600 / 9);
    expect(goal.carbohydrate).toBeCloseTo((2000 - 128 * 4 - 600) / 4);
    expect(goal.warnings).toEqual([]);
  });

  it('defaults fibre to 14 g per 1,000 kcal', () => {
    const split = { proteinGPerKg: 1.6, fatEnergyShare: 0.3 };

    expect(macroGoal(2000, 80, split).fibre).toBe(28);
    expect(macroGoal(1500, 80, split).fibre).toBe(21);
  });

  it('floors carbohydrate at zero, with a warning, when protein and fat take more than the energy', () => {
    const goal = macroGoal(1200, 120, {
      proteinGPerKg: 2.2,
      fatEnergyShare: 0.3,
    });

    expect(goal.protein).toBeCloseTo(264);
    expect(goal.fat).toBeCloseTo(40);
    expect(goal.carbohydrate).toBe(0);
    expect(goal.warnings).toEqual(['carbohydrate_floored']);
  });

  it('does not warn when protein and fat take exactly the energy', () => {
    const goal = macroGoal(1000, 50, {
      proteinGPerKg: 2.5,
      fatEnergyShare: 0.5,
    });

    expect(goal.carbohydrate).toBe(0);
    expect(goal.warnings).toEqual([]);
  });
});
