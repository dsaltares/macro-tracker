import type { ReferenceSource } from '../../domain/foods/sources.ts';
import { createCofidSource } from './cofid/workbook.ts';
import { createOpenFoodFactsSource } from './open-food-facts/export.ts';
import type { FoodSource } from './types.ts';

export const sourceAdapters: Partial<
  Record<ReferenceSource, () => FoodSource>
> = {
  off: () => createOpenFoodFactsSource(),
  cofid: () => createCofidSource(),
};
