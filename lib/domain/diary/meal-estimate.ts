import { z } from 'zod';
import { confidenceSchema, isUnsure } from '../foods/label-reading.ts';
import { oneGram, type Portion } from '../foods/portions.ts';
import { nutrientVectorSchema } from '../foods/source-food.ts';
import { nutrientKeys } from '../nutrition/nutrients.ts';
import type { NutrientVector } from '../nutrition/vector.ts';
import { type RecipeAmount, recipePortionOf } from '../recipes/recipes.ts';
import {
  dayTotals,
  maxEntryLabelLength,
  type QuickEntryNutrients,
  quickEntryNutrients,
  resolveEntry,
} from './entries.ts';

export const maxEstimateNoteLength = 300;

export const maxMealDescriptionLength = 500;

export const maxMealPhotos = 4;

export const maxDraftItemNameLength = 300;

const gramsSchema = z
  .number()
  .positive()
  .describe('The weight of this item in grams, as you estimate it');

const itemFields = {
  name: z.string().trim().min(1).max(maxEntryLabelLength),
  grams: gramsSchema,
  confidence: confidenceSchema,
  note: z
    .string()
    .trim()
    .min(1)
    .max(maxEstimateNoteLength)
    .nullable()
    .describe('What the user should check about this item, or null'),
};

export const estimatedPortionSchema = z
  .strictObject({
    label: z.string().min(1).describe("One of the food's portion labels"),
    quantity: z.number().positive(),
  })
  .nullable()
  .describe(
    "A quantity of one of the food's portions, when you chose one; its grams are then its weight times the quantity",
  );

const foodItemSchema = z.strictObject({
  kind: z.literal('food'),
  ...itemFields,
  foodId: z.string().min(1),
  portion: estimatedPortionSchema,
});

const recipeItemSchema = z.strictObject({
  kind: z.literal('recipe'),
  ...itemFields,
  recipeId: z.string().min(1),
  servings: z
    .number()
    .positive()
    .nullable()
    .describe('The number of servings eaten, or null to go by the grams'),
});

export const guessedNutrientsSchema = z
  .strictObject({
    energy_kcal: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbohydrate: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  })
  .describe('Your estimate of the energy and macros in the grams you named');

const guessItemSchema = z.strictObject({
  kind: z.literal('guess'),
  ...itemFields,
  nutrients: guessedNutrientsSchema,
});

export const estimatedItemSchema = z.discriminatedUnion('kind', [
  foodItemSchema,
  recipeItemSchema,
  guessItemSchema,
]);

export type EstimatedItem = z.infer<typeof estimatedItemSchema>;

export const mealEstimateSchema = z.strictObject({
  items: z.array(estimatedItemSchema),
  notes: z
    .array(z.string().trim().min(1).max(maxEstimateNoteLength))
    .describe(
      'What you could not tell: a hidden sauce, a cup you could not size',
    ),
});

export type MealEstimate = z.infer<typeof mealEstimateSchema>;

export type MatchedFood = {
  name: string;
  nutrients: NutrientVector;
  portions: readonly Portion[];
};

export type ResolvedMatches = {
  foods: ReadonlyMap<string, MatchedFood>;
  recipes: ReadonlyMap<string, MatchedFood>;
};

type DraftItemFields = {
  name: string;
  grams: number;
  confidence: number;
  unsure: boolean;
  note: string | null;
  nutrients: NutrientVector;
};

export type MealDraftItem = DraftItemFields &
  (
    | { kind: 'food'; foodId: string; portionLabel: string; quantity: number }
    | { kind: 'recipe'; recipeId: string; amount: RecipeAmount }
    | { kind: 'guess'; unresolved: boolean }
  );

export type MealDraft = {
  items: MealDraftItem[];
  totals: NutrientVector;
  notes: string[];
};

const draftItemFields = {
  name: z.string().trim().min(1).max(maxDraftItemNameLength),
  grams: z.number().positive(),
  confidence: confidenceSchema,
  unsure: z.boolean(),
  note: itemFields.note,
  nutrients: nutrientVectorSchema,
};

const positiveAmount = z.number().positive();

export const mealDraftSchema = z.strictObject({
  items: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('food'),
        ...draftItemFields,
        foodId: z.string().min(1),
        portionLabel: z.string().min(1),
        quantity: positiveAmount,
      }),
      z.strictObject({
        kind: z.literal('recipe'),
        ...draftItemFields,
        recipeId: z.string().min(1),
        amount: z.union([
          z.strictObject({ servings: positiveAmount }),
          z.strictObject({ grams: positiveAmount }),
        ]),
      }),
      z.strictObject({
        kind: z.literal('guess'),
        ...draftItemFields,
        unresolved: z.boolean(),
      }),
    ]),
  ),
  totals: nutrientVectorSchema,
  notes: mealEstimateSchema.shape.notes,
}) satisfies z.ZodType<MealDraft>;

export const previousEstimateSchema = z.strictObject({
  draft: mealDraftSchema,
  feedback: z.string().trim().min(1).max(maxMealDescriptionLength),
});

export type PreviousEstimate = z.infer<typeof previousEstimateSchema>;

export type ItemAssessment = Pick<
  DraftItemFields,
  'confidence' | 'unsure' | 'note'
>;

const fullConfidence = 1;

export const checkedByUser = (
  item: MealDraftItem | null = null,
): ItemAssessment => ({
  confidence: item?.confidence ?? fullConfidence,
  unsure: false,
  note: item?.note ?? null,
});

const assessmentOf = ({ confidence, note }: EstimatedItem): ItemAssessment => ({
  confidence,
  unsure: isUnsure(confidence),
  note,
});

export type FoodToDraft = MatchedFood & { id: string };

export const foodDraftItem = (
  food: FoodToDraft,
  portion: Portion,
  quantity: number,
  assessment: ItemAssessment,
): MealDraftItem => {
  const { grams, nutrients } = resolveEntry(food, portion, quantity);
  return {
    kind: 'food',
    foodId: food.id,
    portionLabel: portion.label,
    quantity,
    name: food.name,
    grams,
    nutrients,
    ...assessment,
  };
};

export const recipeDraftItem = (
  recipe: FoodToDraft,
  amount: RecipeAmount,
  assessment: ItemAssessment,
): MealDraftItem => {
  const { portion, quantity } = recipePortionOf(recipe.portions, amount);
  const { grams, nutrients } = resolveEntry(recipe, portion, quantity);
  return {
    kind: 'recipe',
    recipeId: recipe.id,
    amount,
    name: recipe.name,
    grams,
    nutrients,
    ...assessment,
  };
};

export type GuessedAmounts = {
  name: string;
  grams: number;
  nutrients: NutrientVector;
};

export const guessDraftItem = (
  { name, grams, nutrients }: GuessedAmounts,
  assessment: ItemAssessment,
): MealDraftItem => ({
  kind: 'guess',
  unresolved: false,
  name,
  grams,
  nutrients: quickEntryNutrients({ totals: nutrients }),
  ...assessment,
});

export const replacedDraftItem = (
  item: MealDraftItem,
  replacement:
    | { kind: 'food'; food: FoodToDraft }
    | { kind: 'recipe'; recipe: FoodToDraft },
): MealDraftItem =>
  replacement.kind === 'food'
    ? foodDraftItem(replacement.food, oneGram, item.grams, checkedByUser())
    : recipeDraftItem(
        replacement.recipe,
        { grams: item.grams },
        checkedByUser(),
      );

const unresolvedGuess = (item: EstimatedItem): MealDraftItem => ({
  kind: 'guess',
  unresolved: true,
  name: item.name,
  grams: item.grams,
  nutrients: {},
  ...assessmentOf(item),
});

type EstimatedFoodItem = Extract<EstimatedItem, { kind: 'food' }>;

const byGrams = (grams: number) => ({ portion: oneGram, quantity: grams });

const foodPortionOf = (
  food: MatchedFood,
  { portion: estimated, grams }: EstimatedFoodItem,
): { portion: Portion; quantity: number } => {
  if (estimated === null) {
    return byGrams(grams);
  }
  const portion = food.portions.find(({ label }) => label === estimated.label);
  return portion === undefined
    ? byGrams(grams)
    : { portion, quantity: estimated.quantity };
};

const draftItemOf = (
  item: EstimatedItem,
  { foods, recipes }: ResolvedMatches,
): MealDraftItem => {
  switch (item.kind) {
    case 'food': {
      const food = foods.get(item.foodId);
      if (food === undefined) {
        return unresolvedGuess(item);
      }
      const { portion, quantity } = foodPortionOf(food, item);
      return foodDraftItem(
        { ...food, id: item.foodId },
        portion,
        quantity,
        assessmentOf(item),
      );
    }
    case 'recipe': {
      const recipe = recipes.get(item.recipeId);
      if (recipe === undefined) {
        return unresolvedGuess(item);
      }
      return recipeDraftItem(
        { ...recipe, id: item.recipeId },
        item.servings === null
          ? { grams: item.grams }
          : { servings: item.servings },
        assessmentOf(item),
      );
    }
    case 'guess':
      return guessDraftItem(item, assessmentOf(item));
  }
};

export const draftOfItems = (
  items: MealDraftItem[],
  notes: string[],
): MealDraft => ({ items, totals: dayTotals(items), notes });

export const mealDraft = (
  estimate: MealEstimate,
  resolved: ResolvedMatches,
): MealDraft =>
  draftOfItems(
    estimate.items.map((item) => draftItemOf(item, resolved)),
    estimate.notes,
  );

export type MealEntryToAdd =
  | { kind: 'food'; foodId: string; portion: string; quantity: number }
  | { kind: 'recipe'; recipeId: string; amount: RecipeAmount }
  | { kind: 'quick'; label: string; nutrients: QuickEntryNutrients };

const entryOf = (item: MealDraftItem): MealEntryToAdd => {
  switch (item.kind) {
    case 'food':
      return {
        kind: 'food',
        foodId: item.foodId,
        portion: item.portionLabel,
        quantity: item.quantity,
      };
    case 'recipe':
      return { kind: 'recipe', recipeId: item.recipeId, amount: item.amount };
    case 'guess':
      return {
        kind: 'quick',
        label: item.name,
        nutrients: { totals: item.nutrients },
      };
  }
};

export const mealDraftToEntries = (draft: MealDraft): MealEntryToAdd[] =>
  draft.items.map(entryOf);

export const maxFeedbackRounds = 3;

export type DraftChange = 'added' | 'changed' | 'unchanged';

const sourceOf = (item: MealDraftItem) => {
  switch (item.kind) {
    case 'food':
      return `food:${item.foodId}`;
    case 'recipe':
      return `recipe:${item.recipeId}`;
    case 'guess':
      return `guess:${item.name.trim().toLowerCase()}`;
  }
};

const sameAmounts = (a: MealDraftItem, b: MealDraftItem) =>
  a.grams === b.grams &&
  nutrientKeys.every((key) => a.nutrients[key] === b.nutrients[key]);

export const draftChanges = (
  previous: MealDraft,
  revised: MealDraft,
): DraftChange[] => {
  const unmatched = [...previous.items];
  return revised.items.map((item) => {
    const match = unmatched.find(
      (candidate) => sourceOf(candidate) === sourceOf(item),
    );
    if (match === undefined) {
      return 'added';
    }
    unmatched.splice(unmatched.indexOf(match), 1);
    return sameAmounts(match, item) ? 'unchanged' : 'changed';
  });
};
