import type { Logger } from 'pino';
import { normaliseBarcode } from '../../../domain/foods/barcode.ts';
import { isSoldInEurope } from '../../../domain/foods/countries.ts';
import type { SourceFood } from '../../../domain/foods/source-food.ts';
import {
  declaresNutritionFacts,
  type OffProduct,
  sourceFoodFromOff,
} from './mapping.ts';

export type ProductCounts = {
  notInEurope: number;
  invalidBarcode: number;
  noNutritionFacts: number;
  rejected: number;
  foods: number;
};

export const emptyProductCounts = (): ProductCounts => ({
  notInEurope: 0,
  invalidBarcode: 0,
  noNutritionFacts: 0,
  rejected: 0,
  foods: 0,
});

export type ProductRead = {
  countryTags: () => readonly string[];
  code: () => string;
  nutriments: () => Record<string, unknown>;
  product: (nutriments: Record<string, unknown>) => OffProduct;
};

export const keptFood = (
  read: ProductRead,
  counts: ProductCounts,
  logger: Logger,
): SourceFood | undefined => {
  if (!isSoldInEurope(read.countryTags())) {
    counts.notInEurope += 1;
    return undefined;
  }
  if (normaliseBarcode(read.code()) === null) {
    counts.invalidBarcode += 1;
    return undefined;
  }
  const nutriments = read.nutriments();
  if (!declaresNutritionFacts(nutriments)) {
    counts.noNutritionFacts += 1;
    return undefined;
  }
  const mapped = sourceFoodFromOff(read.product(nutriments));
  if (!mapped.success) {
    counts.rejected += 1;
    logger.debug({ reason: mapped.reason }, 'rejected a product');
    return undefined;
  }
  counts.foods += 1;
  return mapped.food;
};
