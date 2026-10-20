import { describe, expect, it } from 'vitest';
import { hundredGrams, oneGram, standardPortions } from '../foods/portions.ts';
import { servingLabel } from '../recipes/recipes.ts';
import {
  checkedByUser,
  draftOfItems,
  foodDraftItem,
  guessDraftItem,
  type MatchedFood,
  mealDraft,
  mealDraftToEntries,
  mealEstimateSchema,
  previousEstimateSchema,
  type ResolvedMatches,
  recipeDraftItem,
  replacedDraftItem,
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

describe('checkedByUser', () => {
  it('is sure of an item the user added', () => {
    expect(checkedByUser()).toEqual({
      confidence: 1,
      unsure: false,
      note: null,
    });
  });

  it("keeps an edited item's confidence and note, no longer unsure", () => {
    const [sauce] = draftOf([sauceItem]).items;

    expect(checkedByUser(sauce)).toEqual({
      confidence: 0.4,
      unsure: false,
      note: 'Looked like a satay sauce',
    });
  });
});

describe('draft items edited in review', () => {
  const sure = checkedByUser();

  it('resolves a food at a quantity of one of its portions', () => {
    expect(
      foodDraftItem(
        { ...banana, id: 'banana' },
        { label: '1 medium', grams: 150 },
        2,
        sure,
      ),
    ).toMatchObject({
      kind: 'food',
      foodId: 'banana',
      portionLabel: '1 medium',
      quantity: 2,
      name: 'Banana, raw',
      grams: 300,
      nutrients: { energy_kcal: 267 },
      ...sure,
    });
  });

  it('resolves a recipe by servings or by grams', () => {
    expect(
      recipeDraftItem({ ...chili, id: 'chili' }, { servings: 2 }, sure),
    ).toMatchObject({
      kind: 'recipe',
      recipeId: 'chili',
      amount: { servings: 2 },
      name: 'Chili con carne',
      grams: 700,
      nutrients: { energy_kcal: 840 },
    });
    expect(
      recipeDraftItem({ ...chili, id: 'chili' }, { grams: 50 }, sure),
    ).toMatchObject({ grams: 50, nutrients: { energy_kcal: 60 } });
  });

  it('takes the totals of a guess, filling energy from the macros', () => {
    expect(
      guessDraftItem(
        {
          name: 'Satay sauce',
          grams: 40,
          nutrients: { protein: 2, carbohydrate: 4, fat: 7 },
        },
        sure,
      ),
    ).toEqual({
      kind: 'guess',
      unresolved: false,
      name: 'Satay sauce',
      grams: 40,
      nutrients: {
        energy_kcal: 87,
        protein: 2,
        carbohydrate: 4,
        fat: 7,
      },
      ...sure,
    });
  });

  it('replaces an item with a food at the same grams', () => {
    const [unresolved] = draftOf([bananaItem], nothing).items;
    if (unresolved === undefined) {
      throw new Error('The draft has no item');
    }

    expect(
      replacedDraftItem(unresolved, {
        kind: 'food',
        food: { ...banana, id: 'banana' },
      }),
    ).toMatchObject({
      kind: 'food',
      foodId: 'banana',
      portionLabel: oneGram.label,
      quantity: 200,
      grams: 200,
      unsure: false,
      note: null,
    });
  });

  it('replaces an item with a recipe by the same grams', () => {
    const [sauce] = draftOf([sauceItem]).items;
    if (sauce === undefined) {
      throw new Error('The draft has no item');
    }

    expect(
      replacedDraftItem(sauce, {
        kind: 'recipe',
        recipe: { ...chili, id: 'chili' },
      }),
    ).toMatchObject({
      kind: 'recipe',
      recipeId: 'chili',
      amount: { grams: 30 },
      grams: 30,
      nutrients: { energy_kcal: 36 },
    });
  });

  it('sums the items it is given into the totals', () => {
    const { items } = draftOf([bananaItem, sauceItem]);

    expect(draftOfItems(items.slice(1), ['A note'])).toEqual({
      items: items.slice(1),
      totals: { energy_kcal: 90, protein: 2, carbohydrate: 4, fat: 7 },
      notes: ['A note'],
    });
  });
});

describe('previousEstimateSchema', () => {
  const draft = () =>
    draftOf([
      { ...bananaItem, portion: { label: '1 medium', quantity: 2 } },
      { ...chiliItem, servings: null },
      sauceItem,
      { ...bananaItem, foodId: 'gone' },
    ]);

  it('takes a draft as mealDraft answers it, with the feedback trimmed', () => {
    expect(
      previousEstimateSchema.parse({
        draft: draft(),
        feedback: '  The rice was brown  ',
      }),
    ).toEqual({ draft: draft(), feedback: 'The rice was brown' });
  });

  it.each([
    ['empty feedback', { draft: draft(), feedback: '  ' }],
    [
      'feedback over 500 characters',
      { draft: draft(), feedback: 'a'.repeat(501) },
    ],
    [
      'an item of an unknown kind',
      { draft: { ...draft(), items: [{ kind: 'meal' }] }, feedback: 'More' },
    ],
    [
      'a recipe amount of both servings and grams',
      {
        draft: {
          ...draft(),
          items: [{ ...draft().items[1], amount: { servings: 1, grams: 100 } }],
        },
        feedback: 'More',
      },
    ],
  ])('refuses %s', (_, previous) => {
    expect(previousEstimateSchema.safeParse(previous).success).toBe(false);
  });
});
