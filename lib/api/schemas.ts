import { z } from 'zod';
import { apiKeyScopes } from '../domain/api-keys.ts';
import { bodyMetrics } from '../domain/body/measurements.ts';
import { dateSchema } from '../domain/dates.ts';
import { entryKinds, meals } from '../domain/diary/entries.ts';
import { portionSources, sources } from '../domain/foods/sources.ts';
import type { GoalWarning } from '../domain/goals/derived.ts';
import { goalModes } from '../domain/goals/settings.ts';
import { nutrientKeys, nutrients } from '../domain/nutrition/nutrients.ts';
import { activityLevels, sexes } from '../domain/profile.ts';
import { apiErrorCodes } from './errors.ts';

const nutrientKeySchema = z.enum(nutrientKeys);

const unitsByKey = nutrients
  .map(({ key, unit }) => `${key} in ${unit}`)
  .join(', ');

export const nutrientVector = z
  .partialRecord(nutrientKeySchema, z.number())
  .meta({
    id: 'NutrientVector',
    description: `Amounts by canonical nutrient key, each in the nutrient's unit: ${unitsByKey}. A nutrient nothing declared is absent.`,
  });

export const canonicalNutrients = z
  .record(nutrientKeySchema, z.number().nullable())
  .meta({
    id: 'CanonicalNutrients',
    description: `Every canonical nutrient per 100 g, in canon order, null where the food does not declare it. Units: ${unitsByKey}.`,
  });

export const idSchema = z.string().min(1);

export const timeSchema = z
  .string()
  .nullable()
  .meta({ description: 'The time of day as HH:MM, or null.' });

export const timestampSchema = z.iso.datetime();

export const mealSchema = z.enum(meals);

export const page = <Item extends z.ZodType>(item: Item) =>
  z.object({
    items: z.array(item),
    nextCursor: z
      .string()
      .nullable()
      .describe(
        'Send it back as ?cursor= to read the next page. null on the last page.',
      ),
  });

export const account = z
  .object({
    id: idSchema,
    email: z.string(),
    name: z.string(),
    profile: z
      .object({
        sex: z.enum(sexes),
        birthDate: dateSchema,
        heightCm: z.number(),
        activityLevel: z.enum(activityLevels),
      })
      .nullable()
      .describe('null until the user has completed onboarding.'),
    apiKey: z
      .object({
        name: z.string(),
        prefix: z.string().describe('The first eight characters of the key.'),
        scopes: z.array(z.enum(apiKeyScopes)),
      })
      .describe('The key this request was made with.'),
  })
  .meta({ id: 'Account' });

const portionFields = {
  label: z.string(),
  grams: z.number().describe('The weight of one of this portion, in grams.'),
};

export const portion = z
  .object({
    id: z
      .string()
      .nullable()
      .describe('null for a standard portion (100 g, 1 g, 1 ml).'),
    ...portionFields,
    source: z.enum([...portionSources, 'standard']),
  })
  .meta({
    id: 'Portion',
    description:
      'A portion of a food. Log an amount as a quantity of one of these, by its label.',
  });

export const foodSummary = z
  .object({
    id: idSchema,
    source: z.enum(sources),
    name: z.string(),
    brand: z.string().nullable(),
    quantityLabel: z
      .string()
      .nullable()
      .describe('The pack size as printed, such as "500 g".'),
    defaultPortion: z
      .object(portionFields)
      .describe('The portion to offer first.'),
    nutrients: canonicalNutrients,
  })
  .meta({ id: 'FoodSummary', description: 'A food as search lists it.' });

export const food = z
  .object({
    id: idSchema,
    source: z.enum(sources),
    barcode: z.string().nullable().describe('An EAN-13 or EAN-8, or null.'),
    name: z.string(),
    brand: z.string().nullable(),
    quantityLabel: z.string().nullable(),
    archived: z.boolean(),
    nutrients: canonicalNutrients,
    portions: z.array(portion),
  })
  .meta({ id: 'Food' });

export const diaryEntry = z
  .object({
    id: idSchema,
    kind: z.enum(entryKinds),
    date: dateSchema,
    meal: mealSchema,
    time: timeSchema,
    label: z
      .string()
      .describe("The food's or recipe's name, or the quick entry's label."),
    foodId: z
      .string()
      .nullable()
      .describe('For a food entry; null once the food is deleted.'),
    recipeId: z.string().nullable().describe('For a recipe entry.'),
    quantity: z
      .number()
      .nullable()
      .describe('How many of the portion. null for a quick entry.'),
    portion: z
      .string()
      .nullable()
      .describe(
        'The portion label the quantity counts. null for a quick entry.',
      ),
    grams: z
      .number()
      .nullable()
      .describe('The weight logged. null for a quick entry.'),
    nutrients: nutrientVector.describe(
      'The nutrients of the entry, snapshotted when it was logged.',
    ),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .meta({ id: 'DiaryEntry' });

export const diaryDay = z
  .object({
    date: dateSchema,
    meals: z.array(
      z.object({
        meal: mealSchema,
        entries: z.array(diaryEntry),
        totals: nutrientVector,
      }),
    ),
    totals: nutrientVector,
  })
  .meta({
    id: 'DiaryDay',
    description:
      'One day of the diary: every meal, in order, with its entries and totals.',
  });

export const measurement = z
  .object({
    id: idSchema,
    date: dateSchema,
    metric: z.enum(bodyMetrics),
    value: z.number().describe('In the unit the metric names.'),
  })
  .meta({ id: 'Measurement' });

export const goalSettings = z
  .object({
    mode: z.enum(goalModes),
    weeklyRateKg: z
      .number()
      .describe('The weight change aimed for, in kg a week; negative to lose.'),
    proteinGPerKg: z
      .number()
      .describe('Grams of protein per kg of body weight.'),
    fatEnergyShare: z
      .number()
      .describe('The share of energy from fat, 0 to 1.'),
    overrides: nutrientVector.describe(
      "Goals set by hand, over the derived ones. A manual goal's energy and macros live here.",
    ),
  })
  .meta({ id: 'GoalSettings' });

const goalWarnings = [
  'energy_below_minimum',
  'rate_above_maximum',
  'carbohydrate_floored',
] as const satisfies readonly GoalWarning[];

export const goal = z
  .object({
    mode: z.enum(goalModes),
    weightKg: z
      .number()
      .nullable()
      .describe('The weight the goal was derived from.'),
    bmr: z
      .number()
      .nullable()
      .describe('Basal metabolic rate, kcal a day. null for a manual goal.'),
    tdee: z
      .number()
      .nullable()
      .describe(
        'Total daily energy expenditure, kcal a day. null for a manual goal.',
      ),
    nutrients: nutrientVector.describe(
      'The target, or for some micronutrients the upper limit, of each nutrient.',
    ),
    warnings: z.array(z.enum(goalWarnings)),
  })
  .meta({ id: 'Goal' });

export const recipeSummary = z
  .object({
    id: idSchema,
    name: z.string(),
    servings: z.number(),
    cookedWeightG: z
      .number()
      .nullable()
      .describe('The weight of the cooked recipe, when known.'),
  })
  .meta({ id: 'RecipeSummary' });

export const ingredient = z
  .object({
    id: idSchema,
    kind: z.enum(['food', 'recipe']),
    foodId: z.string().nullable(),
    recipeId: z.string().nullable().describe('For a nested recipe.'),
    name: z.string(),
    portionLabel: z.string(),
    quantity: z.number(),
    grams: z.number(),
    per100g: nutrientVector,
    nutrients: nutrientVector.describe(
      'The nutrients of this ingredient at its grams.',
    ),
  })
  .meta({ id: 'Ingredient' });

export const recipe = recipeSummary
  .extend({
    notes: z.string().nullable(),
    archived: z.boolean(),
    ingredients: z.array(ingredient),
    nutrients: z.object({
      grams: z
        .number()
        .describe(
          'The weight the totals are over: the cooked weight, or else the ingredients.',
        ),
      total: nutrientVector,
      perServing: nutrientVector,
      per100g: nutrientVector,
    }),
    portions: z.array(z.object(portionFields)).describe('1 serving and 100 g.'),
  })
  .meta({ id: 'Recipe' });

export const trendDay = z
  .object({
    date: dateSchema,
    logged: z.boolean().describe('Whether the day has any entry.'),
    totals: nutrientVector,
    rollingAverage: nutrientVector
      .nullable()
      .describe(
        'The average over the seven days ending on this one, over logged days alone.',
      ),
    goal: nutrientVector.nullable().describe('The goal on this date.'),
  })
  .meta({ id: 'TrendDay' });

export const errorEnvelope = z
  .object({
    error: z.object({
      code: z.enum(apiErrorCodes),
      message: z.string(),
      issues: z
        .array(
          z.object({
            path: z.array(z.union([z.string(), z.number()])),
            message: z.string(),
          }),
        )
        .optional()
        .describe(
          'For INVALID_REQUEST: each problem with the query, body or path.',
        ),
    }),
  })
  .meta({ id: 'Error', description: 'Every error, whatever its status.' });
