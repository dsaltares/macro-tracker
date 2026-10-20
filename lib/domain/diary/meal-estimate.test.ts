import { describe, expect, it } from 'vitest';
import { hundredGrams, standardPortions } from '../foods/portions.ts';
import { servingLabel } from '../recipes/recipes.ts';
import {
  type MatchedFood,
  mealDraft,
  mealDraftToEntries,
  mealEstimateSchema,
  type ResolvedMatches,
} from './meal-estimate.ts';

const base = { name: 'Something', grams: 100, confidence: 0.9, note: null };

const bananaItem = {
  ...base,
  kind: 'food',
  name: 'Banana',
  grams: 200,
  foodId: 'banana',
  portion: null,
};

const chiliItem = {
  ...base,
  kind: 'recipe',
  name: 'Chili',
  grams: 300,
  recipeId: 'chili',
  servings: 1,
};

const sauceItem = {
  ...base,
  kind: 'guess',
  name: 'Unknown sauce',
  grams: 30,
  confidence: 0.4,
  note: 'Looked like a satay sauce',
  nutrients: { energy_kcal: 90, protein: 2, carbohydrate: 4, fat: 7 },
};

const estimate = (items: unknown[], notes: string[] = []) =>
  mealEstimateSchema.parse({ items, notes });

const issuesOf = (candidate: unknown) =>
  mealEstimateSchema
    .safeParse(candidate)
    .error?.issues.map(({ path }) => path.join('.'));

describe('mealEstimateSchema', () => {
  it('accepts a food, a recipe and a guess, with notes', () => {
    const parsed = estimate([bananaItem, chiliItem, sauceItem], ['One cup']);

    expect(parsed.items.map(({ kind }) => kind)).toEqual([
      'food',
      'recipe',
      'guess',
    ]);
    expect(parsed.notes).toEqual(['One cup']);
  });

  it('accepts a food with one of its portions and a recipe by grams', () => {
    expect(
      estimate([
        { ...bananaItem, portion: { label: '1 medium', quantity: 2 } },
        { ...chiliItem, servings: null },
      ]).items,
    ).toHaveLength(2);
  });

  it('rejects an item with both a food id and a recipe id', () => {
    expect(
      issuesOf({ items: [{ ...bananaItem, recipeId: 'chili' }], notes: [] }),
    ).toEqual(['items.0']);
    expect(
      issuesOf({ items: [{ ...chiliItem, foodId: 'banana' }], notes: [] }),
    ).toEqual(['items.0']);
  });

  it('rejects a guess without energy', () => {
    const { energy_kcal, ...macros } = sauceItem.nutrients;

    expect(
      issuesOf({ items: [{ ...sauceItem, nutrients: macros }], notes: [] }),
    ).toEqual(['items.0.nutrients.energy_kcal']);
  });

  it('rejects an item of no kind', () => {
    const { kind, ...noKind } = sauceItem;

    expect(issuesOf({ items: [noKind], notes: [] })).toEqual(['items.0.kind']);
  });

  it('rejects grams and quantities that are not positive', () => {
    expect(
      issuesOf({ items: [{ ...bananaItem, grams: 0 }], notes: [] }),
    ).toEqual(['items.0.grams']);
    expect(
      issuesOf({
        items: [{ ...bananaItem, portion: { label: '1 medium', quantity: 0 } }],
        notes: [],
      }),
    ).toEqual(['items.0.portion.quantity']);
    expect(
      issuesOf({ items: [{ ...chiliItem, servings: -1 }], notes: [] }),
    ).toEqual(['items.0.servings']);
  });

  it('rejects a confidence outside 0 to 1', () => {
    expect(
      issuesOf({ items: [{ ...bananaItem, confidence: 1.5 }], notes: [] }),
    ).toEqual(['items.0.confidence']);
  });

  it('keeps a name within the length of an entry label', () => {
    expect(
      issuesOf({
        items: [{ ...bananaItem, name: 'x'.repeat(101) }],
        notes: [],
      }),
    ).toEqual(['items.0.name']);
  });
});

const banana: MatchedFood = {
  name: 'Banana, raw',
  nutrients: { energy_kcal: 89, protein: 1.1, carbohydrate: 22.8, fat: 0.3 },
  portions: [{ label: '1 medium', grams: 150 }, ...standardPortions],
};

const chili: MatchedFood = {
  name: 'Chili con carne',
  nutrients: { energy_kcal: 120, protein: 10, carbohydrate: 8, fat: 5 },
  portions: [{ label: servingLabel, grams: 350 }, hundredGrams],
};

const resolved: ResolvedMatches = {
  foods: new Map([['banana', banana]]),
  recipes: new Map([['chili', chili]]),
};

const nothing: ResolvedMatches = { foods: new Map(), recipes: new Map() };

const draftOf = (items: unknown[], matches = resolved, notes: string[] = []) =>
  mealDraft(estimate(items, notes), matches);

describe('mealDraft', () => {
  it("resolves a food item to the food's vector at the model's grams", () => {
    const [draft] = draftOf([bananaItem]).items;

    expect(draft).toMatchObject({
      kind: 'food',
      foodId: 'banana',
      name: 'Banana, raw',
      grams: 200,
      portionLabel: '1 g',
      quantity: 200,
      nutrients: { energy_kcal: 178, protein: 2.2 },
    });
  });

  it("weighs a quantity of one of the food's portions when the item names it", () => {
    const [draft] = draftOf([
      { ...bananaItem, portion: { label: '1 medium', quantity: 2 } },
    ]).items;

    expect(draft).toMatchObject({
      grams: 300,
      portionLabel: '1 medium',
      quantity: 2,
      nutrients: { energy_kcal: 267 },
    });
  });

  it("goes by the model's grams when the portion is not one of the food's", () => {
    const [draft] = draftOf([
      { ...bananaItem, portion: { label: '1 bunch', quantity: 1 } },
    ]).items;

    expect(draft).toMatchObject({
      grams: 200,
      portionLabel: '1 g',
      quantity: 200,
    });
  });

  it('resolves a recipe item by servings as logging the recipe would', () => {
    const [draft] = draftOf([{ ...chiliItem, servings: 2 }]).items;

    expect(draft).toMatchObject({
      kind: 'recipe',
      recipeId: 'chili',
      name: 'Chili con carne',
      grams: 700,
      amount: { servings: 2 },
      nutrients: { energy_kcal: 840, protein: 70 },
    });
  });

  it('resolves a recipe item by grams when it names no servings', () => {
    const [draft] = draftOf([{ ...chiliItem, servings: null }]).items;

    expect(draft).toMatchObject({
      grams: 300,
      amount: { grams: 300 },
      nutrients: { energy_kcal: 360, protein: 30 },
    });
  });

  it("takes a guess's nutrients from the model", () => {
    const [draft] = draftOf([sauceItem]).items;

    expect(draft).toEqual({
      kind: 'guess',
      unresolved: false,
      name: 'Unknown sauce',
      grams: 30,
      confidence: 0.4,
      unsure: true,
      note: 'Looked like a satay sauce',
      nutrients: { energy_kcal: 90, protein: 2, carbohydrate: 4, fat: 7 },
    });
  });

  it('keeps the line of a food it cannot find as an unresolved guess', () => {
    const [draft] = draftOf([bananaItem], nothing).items;

    expect(draft).toEqual({
      kind: 'guess',
      unresolved: true,
      name: 'Banana',
      grams: 200,
      confidence: 0.9,
      unsure: false,
      note: null,
      nutrients: {},
    });
  });

  it('keeps the line of a recipe it cannot find as an unresolved guess', () => {
    const [draft] = draftOf([chiliItem], nothing).items;

    expect(draft).toMatchObject({
      kind: 'guess',
      unresolved: true,
      name: 'Chili',
      grams: 300,
      nutrients: {},
    });
  });

  it('is unsure of an item below 0.8', () => {
    const { items } = draftOf([
      { ...bananaItem, confidence: 0.79 },
      { ...bananaItem, confidence: 0.8 },
    ]);

    expect(items.map(({ unsure }) => unsure)).toEqual([true, false]);
  });

  it('sums the items into the totals and carries the notes', () => {
    const draft = draftOf([bananaItem, chiliItem, sauceItem], resolved, [
      'The cup may hold more',
    ]);

    expect(draft.totals).toEqual({
      energy_kcal: 178 + 420 + 90,
      protein: 2.2 + 35 + 2,
      carbohydrate: 45.6 + 28 + 4,
      fat: 0.6 + 17.5 + 7,
    });
    expect(draft.notes).toEqual(['The cup may hold more']);
  });

  it('drafts an estimate with nothing in it', () => {
    expect(draftOf([])).toEqual({ items: [], totals: {}, notes: [] });
  });
});

describe('mealDraftToEntries', () => {
  it('turns each item into the entry to add, of its kind', () => {
    const draft = draftOf([
      { ...bananaItem, portion: { label: '1 medium', quantity: 2 } },
      chiliItem,
      sauceItem,
    ]);

    expect(mealDraftToEntries(draft)).toEqual([
      { kind: 'food', foodId: 'banana', portion: '1 medium', quantity: 2 },
      { kind: 'recipe', recipeId: 'chili', amount: { servings: 1 } },
      {
        kind: 'quick',
        label: 'Unknown sauce',
        nutrients: {
          totals: { energy_kcal: 90, protein: 2, carbohydrate: 4, fat: 7 },
        },
      },
    ]);
  });

  it('logs an unresolved guess as a quick entry with no nutrients', () => {
    expect(mealDraftToEntries(draftOf([bananaItem], nothing))).toEqual([
      { kind: 'quick', label: 'Banana', nutrients: { totals: {} } },
    ]);
  });
});
