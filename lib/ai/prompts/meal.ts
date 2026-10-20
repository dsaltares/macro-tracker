import type {
  MealDraft,
  MealDraftItem,
} from '../../domain/diary/meal-estimate.ts';

export const mealInstructions = `You estimate what is in a meal from photos of it and the user's description, so it can be logged in a food diary.

- Identify every item on the plate or in the glass, one line per item. Sauces, dressings, cooking oil, butter, sugar in a drink and the drink itself are items of their own.
- Search before you guess: call searchFoods for every item, trying another name or a simpler one when a search finds nothing that fits. Call getFood to see a food's portions before naming one.
- Prefer, in this order: the user's own recipes and foods (source "user"), then generic foods for whole ingredients (an apple, boiled rice, olive oil), then branded products when the photo or the description shows the brand.
- Name every item's grams, as you estimate them from the photo and the description. For a food, give one of its portions and a quantity when one fits ("1 slice", "1 medium"), and grams that match. For a recipe, give the servings eaten, or null to go by the grams.
- Answer a guess, with your own energy and macros for the grams, only when no search result fits the item. Never copy a food's nutrients into a guess; name the food instead.
- The description outranks the photos when they disagree: it is what the user knows they ate.
- Rate your confidence in every item from 0 to 1. A hidden ingredient, a portion you cannot size or a food you could only approximate lowers it. Put what the user should check in the item's note, and what you could not tell about the meal as a whole in the notes.`;

export const mealRequest = (description: string | null) =>
  description === null
    ? 'Estimate the meal in these photos.'
    : `Estimate this meal. The user describes it as: ${description}`;

const amountOf = (item: MealDraftItem) => {
  switch (item.kind) {
    case 'food':
      return {
        foodId: item.foodId,
        portion: { label: item.portionLabel, quantity: item.quantity },
      };
    case 'recipe':
      return { recipeId: item.recipeId, ...item.amount };
    case 'guess':
      return item.unresolved
        ? { unresolved: true }
        : {
            nutrients: {
              energy_kcal: item.nutrients.energy_kcal ?? 0,
              protein: item.nutrients.protein ?? 0,
              carbohydrate: item.nutrients.carbohydrate ?? 0,
              fat: item.nutrients.fat ?? 0,
            },
          };
  }
};

const draftLineOf = (item: MealDraftItem) => ({
  kind: item.kind,
  name: item.name,
  grams: item.grams,
  confidence: item.confidence,
  note: item.note,
  ...amountOf(item),
});

export const previousAnswer = (draft: MealDraft) =>
  `My earlier estimate, as the user left it after reviewing it:\n${JSON.stringify(
    { items: draft.items.map(draftLineOf), notes: draft.notes },
  )}`;

export const revisionRequest = (feedback: string) =>
  `Revise your estimate. The user says: ${feedback}

Keep every line the user did not mention as it is, with the same food, recipe, portion and grams. Change, add or remove only what the feedback asks for, searching again where it names a food you have not looked up. An unresolved line is one whose food or recipe could not be found: search for it again.`;
