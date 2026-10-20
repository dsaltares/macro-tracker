import { createLabelReader, type LabelReader } from './label-reader.ts';
import { createMealEstimator, type MealEstimator } from './meal-estimator.ts';
import { resolveLanguageModel } from './model.ts';

let labelReader: LabelReader | null | undefined;
let mealEstimator: MealEstimator | null | undefined;

export const getLabelReader = (): LabelReader | null => {
  if (labelReader === undefined) {
    const model = resolveLanguageModel();
    labelReader = model === null ? null : createLabelReader({ model });
  }
  return labelReader;
};

export const getMealEstimator = (): MealEstimator | null => {
  if (mealEstimator === undefined) {
    const model = resolveLanguageModel();
    mealEstimator = model === null ? null : createMealEstimator({ model });
  }
  return mealEstimator;
};
