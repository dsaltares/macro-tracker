import { describe, expect, it } from 'vitest';
import { defaultGoalSettings } from '../goals/settings.ts';
import { type Export, exportSchema, exportVersion } from './schema.ts';

const instant = '2026-10-20T12:00:00.000Z';

const everything: Export = {
  version: exportVersion,
  exportedAt: instant,
  profile: {
    sex: 'female',
    birthDate: '1990-04-02',
    heightCm: 168,
    activityLevel: 'moderate',
  },
  goals: defaultGoalSettings,
  foods: [
    {
      id: 'food-1',
      name: 'Granola',
      brand: null,
      barcode: null,
      quantityLabel: null,
      nutrients: { energy_kcal: 450, protein: 10 },
      portions: [{ label: 'bowl', grams: 60 }],
      createdAt: instant,
      updatedAt: instant,
    },
  ],
  entries: [
    {
      id: 'entry-1',
      date: '2026-10-20',
      meal: 'breakfast',
      time: '08:15',
      kind: 'food',
      foodId: 'food-1',
      recipeId: null,
      label: 'Granola',
      quantity: 1,
      portionLabel: 'bowl',
      grams: 60,
      nutrients: { energy_kcal: 270, protein: 6 },
      createdAt: instant,
      updatedAt: instant,
    },
  ],
  measurements: [{ date: '2026-10-20', metric: 'weight_kg', value: 72.4 }],
};

describe('exportSchema', () => {
  it('accepts a whole export', () => {
    expect(exportSchema.parse(everything)).toEqual(everything);
  });

  it('accepts an account with no profile and nothing logged', () => {
    const empty = {
      ...everything,
      profile: null,
      foods: [],
      entries: [],
      measurements: [],
    };

    expect(exportSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ['another version', { version: 2 }],
    ['an unknown field', { recipes: [] }],
    [
      'an entry on a date that is not one',
      { entries: [{ ...everything.entries[0], date: '20/10/2026' }] },
    ],
    [
      'a nutrient outside the canon',
      { foods: [{ ...everything.foods[0], nutrients: { salt: 1 } }] },
    ],
    [
      'a measurement of an unknown metric',
      { measurements: [{ date: '2026-10-20', metric: 'waist_cm', value: 80 }] },
    ],
  ])('refuses %s', (_, change) => {
    expect(exportSchema.safeParse({ ...everything, ...change }).success).toBe(
      false,
    );
  });
});
