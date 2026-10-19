import type { ReferenceSource } from '../../domain/foods/sources.ts';
import { createCiqualSource } from './ciqual/table.ts';
import { createOpenFoodFactsSource } from './open-food-facts/export.ts';
import type { FoodSource } from './types.ts';

export const sourceAdapters: Partial<
  Record<ReferenceSource, () => FoodSource>
> = {
  off: () => createOpenFoodFactsSource(),
  ciqual: () => createCiqualSource(),
};
