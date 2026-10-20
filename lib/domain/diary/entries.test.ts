import { describe, expect, it } from 'vitest';
import {
  dayTotals,
  entryKinds,
  meals,
  mealTotals,
  quickEntryNutrients,
  resolveEntry,
} from './entries.ts';

describe('diary entries', () => {
  it('belong to one of four meals, in the order of a day', () => {
    expect(meals).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });

  it('are a food, a recipe or a quick entry', () => {
    expect(entryKinds).toEqual(['food', 'recipe', 'quick']);
  });
});

const oats = {
  nutrients: { energy_kcal: 380, protein: 13, carbohydrate: 60, fat: 7 },
};
const serving = { label: '1 serving', grams: 40 };

describe('resolveEntry', () => {
  it("weighs the quantity of a portion and scales the food's vector to it", () => {
    expect(resolveEntry(oats, serving, 1.5)).toEqual({
      grams: 60,
      nutrients: {
        energy_kcal: 228,
        protein: 7.8,
        carbohydrate: 36,
        fat: 4.2,
      },
    });
  });

  it('resolves a food without energy to the kcal of its macros', () => {
    const shake = { nutrients: { protein: 80, carbohydrate: 5, fat: 2 } };

    expect(resolveEntry(shake, { label: '1 scoop', grams: 50 }, 1)).toEqual({
      grams: 50,
      nutrients: {
        energy_kcal: 179,
        protein: 40,
        carbohydrate: 2.5,
        fat: 1,
      },
    });
  });

  it('keeps a nutrient the food does not declare unknown', () => {
    const { nutrients } = resolveEntry(oats, serving, 1);

    expect(nutrients).not.toHaveProperty('sodium');
    expect(nutrients).not.toHaveProperty('fibre');
  });

  it('resolves no nutrients for a food that declares none', () => {
    expect(resolveEntry({ nutrients: {} }, serving, 2)).toEqual({
      grams: 80,
      nutrients: {},
    });
  });
});

describe('quickEntryNutrients', () => {
  it('scales a vector per 100 g to the grams eaten', () => {
    expect(
      quickEntryNutrients({
        per100g: { energy_kcal: 250, protein: 10 },
        grams: 200,
      }),
    ).toEqual({ energy_kcal: 500, protein: 20 });
  });

  it('takes totals as they were typed', () => {
    expect(
      quickEntryNutrients({ totals: { energy_kcal: 650, fat: 30 } }),
    ).toEqual({ energy_kcal: 650, fat: 30 });
  });

  it('fills missing energy from the macros of either form', () => {
    expect(
      quickEntryNutrients({
        totals: { protein: 30, carbohydrate: 50, fat: 20 },
      }),
    ).toEqual({ energy_kcal: 500, protein: 30, carbohydrate: 50, fat: 20 });
    expect(
      quickEntryNutrients({ per100g: { alcohol: 10 }, grams: 500 }),
    ).toEqual({ energy_kcal: 350, alcohol: 50 });
  });

  it('leaves energy unknown when there are no macros either', () => {
    expect(quickEntryNutrients({ totals: { caffeine: 80 } })).toEqual({
      caffeine: 80,
    });
  });
});

const entries = [
  { meal: 'breakfast', nutrients: { energy_kcal: 300, protein: 10 } },
  { meal: 'dinner', nutrients: { energy_kcal: 700, protein: 40, sodium: 900 } },
  { meal: 'breakfast', nutrients: { energy_kcal: 100, fibre: 3 } },
] as const;

describe('mealTotals', () => {
  it('sums the snapshots of each meal, in meal order', () => {
    const totals = mealTotals(entries);

    expect(Object.keys(totals)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
    ]);
    expect(totals.breakfast).toEqual({
      energy_kcal: 400,
      protein: 10,
      fibre: 3,
    });
    expect(totals.dinner).toEqual({
      energy_kcal: 700,
      protein: 40,
      sodium: 900,
    });
  });

  it('has an empty total for a meal with nothing logged', () => {
    expect(mealTotals(entries).lunch).toEqual({});
    expect(mealTotals([]).snack).toEqual({});
  });
});

describe('dayTotals', () => {
  it('sums every snapshot of the day', () => {
    expect(dayTotals(entries)).toEqual({
      energy_kcal: 1100,
      protein: 50,
      fibre: 3,
      sodium: 900,
    });
  });

  it('is the sum of the meal totals', () => {
    expect(dayTotals(entries)).toEqual(
      dayTotals(
        Object.values(mealTotals(entries)).map((nutrients) => ({ nutrients })),
      ),
    );
  });

  it('is empty for a day with nothing logged', () => {
    expect(dayTotals([])).toEqual({});
  });
});
