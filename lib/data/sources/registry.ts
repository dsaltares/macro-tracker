import type { ReferenceSource } from '../../domain/foods/sources.ts';
import { createOpenFoodFactsSource } from './open-food-facts/export.ts';
import type { FoodSource } from './types.ts';
import { createUsdaSource } from './usda/fooddata-central.ts';

export const sourceAdapters: Partial<
  Record<ReferenceSource, () => FoodSource>
> = {
  off: () => createOpenFoodFactsSource(),
  usda: () => createUsdaSource(),
};
