import { describe, expect, it } from 'vitest';
import { resolveEntry } from '../diary/entries.ts';
import {
  canNest,
  type NestingFacts,
  recipeAsFood,
  recipeNutrients,
} from './recipes.ts';

const oats = {
  grams: 200,
  per100g: { energy_kcal: 380, protein: 13, carbohydrate: 60, fat: 7 },
};
const milk = {
  grams: 600,
  per100g: { energy_kcal: 50, protein: 3.5, fat: 2, calcium: 120 },
};
const porridge = { servings: 4, cookedWeightG: null };

describe('recipeNutrients', () => {
  it("sums each ingredient's vector at its grams", () => {
    expect(recipeNutrients(porridge, [oats, milk]).total).toEqual({
      energy_kcal: 1060,
      protein: 47,
      carbohydrate: 120,
      fat: 26,
      calcium: 720,
    });
  });

  it('divides the total by the servings', () => {
    expect(recipeNutrients(porridge, [oats, milk]).perServing).toEqual({
      energy_kcal: 265,
      protein: 11.75,
      carbohydrate: 30,
      fat: 6.5,
      calcium: 180,
    });
  });

  it("weighs the recipe as its ingredients' grams without a cooked weight", () => {
    const nutrients = recipeNutrients(porridge, [oats, milk]);

    expect(nutrients.grams).toBe(800);
    expect(nutrients.per100g).toEqual({
      energy_kcal: 132.5,
      protein: 5.875,
      carbohydrate: 15,
      fat: 3.25,
      calcium: 90,
    });
  });

  it('weighs the recipe as its cooked weight when it has one', () => {
    const reduced = { ...porridge, cookedWeightG: 500 };
    const nutrients = recipeNutrients(reduced, [oats, milk]);

    expect(nutrients.grams).toBe(500);
    expect(nutrients.per100g).toEqual({
      energy_kcal: 212,
      protein: 9.4,
      carbohydrate: 24,
      fat: 5.2,
      calcium: 144,
    });
  });

  it('changes the vector per 100 g with the cooked weight but not the one per serving', () => {
    const raw = recipeNutrients(porridge, [oats, milk]);
    const cooked = recipeNutrients({ ...porridge, cookedWeightG: 500 }, [
      oats,
      milk,
    ]);

    expect(cooked.perServing).toEqual(raw.perServing);
    expect(cooked.total).toEqual(raw.total);
    expect(cooked.per100g).not.toEqual(raw.per100g);
  });

  it('fills an ingredient without energy from its macros', () => {
    const whey = {
      grams: 50,
      per100g: { protein: 80, carbohydrate: 5, fat: 2 },
    };

    expect(
      recipeNutrients({ servings: 1, cookedWeightG: null }, [whey]).total,
    ).toEqual({ energy_kcal: 179, protein: 40, carbohydrate: 2.5, fat: 1 });
  });

  it('keeps a nutrient no ingredient declares unknown', () => {
    const { total } = recipeNutrients(porridge, [oats]);

    expect(total).not.toHaveProperty('calcium');
  });

  it('is empty for a recipe without ingredients', () => {
    expect(recipeNutrients(porridge, [])).toEqual({
      grams: 0,
      total: {},
      perServing: {},
      per100g: {},
    });
  });
});

const recipe = (
  id: string,
  facts: Partial<Omit<NestingFacts, 'id'>> = {},
): NestingFacts => ({
  id,
  containsRecipe: false,
  containedInRecipe: false,
  ...facts,
});

describe('canNest', () => {
  it('lets a recipe contain a recipe of foods only', () => {
    expect(canNest(recipe('lasagne'), recipe('bechamel'))).toBe(true);
  });

  it('lets a recipe that already contains a recipe contain another', () => {
    expect(
      canNest(recipe('lasagne', { containsRecipe: true }), recipe('ragu')),
    ).toBe(true);
  });

  it('lets a recipe another one contains be contained again', () => {
    expect(
      canNest(
        recipe('moussaka'),
        recipe('bechamel', { containedInRecipe: true }),
      ),
    ).toBe(true);
  });

  it('refuses a recipe that contains a recipe', () => {
    expect(
      canNest(recipe('lasagne'), recipe('ragu', { containsRecipe: true })),
    ).toBe(false);
  });

  it('refuses a recipe into one that another recipe contains', () => {
    expect(
      canNest(recipe('ragu', { containedInRecipe: true }), recipe('stock')),
    ).toBe(false);
  });

  it('refuses a recipe into itself', () => {
    expect(canNest(recipe('ragu'), recipe('ragu'))).toBe(false);
  });
});

describe('recipeAsFood', () => {
  const reduced = { ...porridge, cookedWeightG: 500 };

  it('is the vector per 100 g of the recipe', () => {
    expect(recipeAsFood(reduced, [oats, milk]).nutrients).toEqual(
      recipeNutrients(reduced, [oats, milk]).per100g,
    );
  });

  it('has a serving of the weight over the servings, and 100 g', () => {
    expect(recipeAsFood(reduced, [oats, milk]).portions).toEqual([
      { label: '1 serving', grams: 125 },
      { label: '100 g', grams: 100 },
    ]);
  });

  it('resolves a serving to the vector per serving', () => {
    const food = recipeAsFood(reduced, [oats, milk]);
    const serving = { label: '1 serving', grams: 125 };

    expect(resolveEntry(food, serving, 1).nutrients).toEqual(
      recipeNutrients(reduced, [oats, milk]).perServing,
    );
  });
});
