import { z } from 'zod';

export const maxRecipeNameLength = 120;
export const maxRecipeNotesLength = 2000;

export const recipeFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(
      maxRecipeNameLength,
      `Keep it under ${maxRecipeNameLength} characters`,
    ),
  servings: z
    .number({ error: 'Enter the servings' })
    .positive('Enter servings above zero')
    .finite(),
  cookedWeightG: z
    .number({ error: 'Enter a weight' })
    .positive('Enter a weight above zero')
    .finite()
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(
      maxRecipeNotesLength,
      `Keep it under ${maxRecipeNotesLength} characters`,
    )
    .nullable()
    .transform((notes) => (notes === '' ? null : notes)),
});

export type RecipeFields = z.output<typeof recipeFieldsSchema>;
