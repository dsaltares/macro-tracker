import { describe, expect, it } from 'vitest';
import { defaultGoalSettings, goalSettingsSchema } from './settings.ts';

describe('goalSettingsSchema', () => {
  it('accepts the default settings', () => {
    expect(goalSettingsSchema.parse(defaultGoalSettings)).toEqual(
      defaultGoalSettings,
    );
  });

  it('accepts an aggressive rate, which only warns', () => {
    expect(
      goalSettingsSchema.safeParse({
        ...defaultGoalSettings,
        weeklyRateKg: -1.5,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['a weekly rate beyond 2 kg', { weeklyRateKg: 2.5 }],
    ['negative protein', { proteinGPerKg: -1 }],
    ['protein above 4 g per kg', { proteinGPerKg: 5 }],
    ['a fat share above 100%', { fatEnergyShare: 1.2 }],
    ['an override that is not a nutrient', { overrides: { kale: 1 } }],
    ['a negative override', { overrides: { iron: -1 } }],
  ])('refuses %s', (_, change) => {
    expect(
      goalSettingsSchema.safeParse({ ...defaultGoalSettings, ...change })
        .success,
    ).toBe(false);
  });

  it('needs an energy target in manual mode', () => {
    const manual = { ...defaultGoalSettings, mode: 'manual' };

    expect(goalSettingsSchema.safeParse(manual).error?.issues).toEqual([
      expect.objectContaining({
        path: ['overrides', 'energy_kcal'],
        message: 'Enter an energy target.',
      }),
    ]);
    expect(
      goalSettingsSchema.safeParse({
        ...manual,
        overrides: { energy_kcal: 2000 },
      }).success,
    ).toBe(true);
  });
});
