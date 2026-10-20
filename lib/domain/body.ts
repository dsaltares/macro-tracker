import { z } from 'zod';

export const bodyMetrics = ['weight_kg'] as const;

export type BodyMetric = (typeof bodyMetrics)[number];

export const minWeightKg = 20;
export const maxWeightKg = 400;

export const weightKgSchema = z
  .number({ error: 'Enter your weight in kg.' })
  .min(minWeightKg, `Enter a weight of at least ${minWeightKg} kg.`)
  .max(maxWeightKg, `Enter a weight of at most ${maxWeightKg} kg.`);

const weightFormat = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 1,
});

export const formatWeight = (kg: number) => `${weightFormat.format(kg)} kg`;
