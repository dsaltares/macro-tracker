import type { ReferenceSource } from '../../domain/foods/sources.ts';
import type { FoodSource } from './types.ts';

export const sourceAdapters: Partial<
  Record<ReferenceSource, () => FoodSource>
> = {};
