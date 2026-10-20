import { z } from 'zod';
import { bodyMetrics } from '../body/measurements.ts';
import { entryKinds, meals } from '../diary/entries.ts';
import {
  nutrientVectorSchema,
  sourcePortionSchema,
} from '../foods/source-food.ts';
import { goalSettingsSchema } from '../goals/settings.ts';
import { profileSchema } from '../profile.ts';

export const exportVersion = 1;

const dateSchema = z.iso.date();

const instantSchema = z.iso.datetime();

export const exportedFoodSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  quantityLabel: z.string().nullable(),
  nutrients: nutrientVectorSchema,
  portions: z.array(sourcePortionSchema),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export type ExportedFood = z.infer<typeof exportedFoodSchema>;

export const exportedEntrySchema = z.strictObject({
  id: z.string().min(1),
  date: dateSchema,
  meal: z.enum(meals),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  kind: z.enum(entryKinds),
  foodId: z.string().nullable(),
  recipeId: z.string().nullable(),
  label: z.string().min(1),
  quantity: z.number().positive().nullable(),
  portionLabel: z.string().nullable(),
  grams: z.number().nonnegative().nullable(),
  nutrients: nutrientVectorSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export type ExportedEntry = z.infer<typeof exportedEntrySchema>;

export const exportedMeasurementSchema = z.strictObject({
  date: dateSchema,
  metric: z.enum(bodyMetrics),
  value: z.number().positive(),
});

export type ExportedMeasurement = z.infer<typeof exportedMeasurementSchema>;

export const exportSchema = z.strictObject({
  version: z.literal(exportVersion),
  exportedAt: instantSchema,
  profile: profileSchema.nullable(),
  goals: goalSettingsSchema,
  foods: z.array(exportedFoodSchema),
  entries: z.array(exportedEntrySchema),
  measurements: z.array(exportedMeasurementSchema),
});

export type Export = z.infer<typeof exportSchema>;
