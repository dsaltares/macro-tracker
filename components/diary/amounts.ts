import type { DiaryEntry } from '@/lib/db/diary';
import type { Meal } from '@/lib/domain/diary/entries';
import { formatAmount } from '@/lib/domain/nutrition/format';
import {
  type NutrientKey,
  nutrientByKey,
} from '@/lib/domain/nutrition/nutrients';
import { type NutrientVector, salt } from '@/lib/domain/nutrition/vector';

export const mealNames: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const unknownAmount = '—';

export const amountOf = (vector: NutrientVector, key: NutrientKey) =>
  formatAmount(vector[key] ?? 0, nutrientByKey[key].unit);

export const knownAmountOf = (vector: NutrientVector, key: NutrientKey) => {
  const amount = vector[key];
  return amount === undefined
    ? unknownAmount
    : formatAmount(amount, nutrientByKey[key].unit);
};

export const saltOf = (vector: NutrientVector) =>
  vector.sodium === undefined
    ? unknownAmount
    : formatAmount(salt(vector.sodium), 'g');

export const macrosOf = (vector: NutrientVector) =>
  `P ${amountOf(vector, 'protein')} · C ${amountOf(vector, 'carbohydrate')} · F ${amountOf(vector, 'fat')}`;

const quantityFormat = new Intl.NumberFormat('en', {
  maximumFractionDigits: 2,
});

export const formatQuantity = (quantity: number) =>
  quantityFormat.format(quantity);

export const servingOf = (entry: DiaryEntry) =>
  entry.quantity === null || entry.portionLabel === null
    ? 'Quick entry'
    : `${formatQuantity(entry.quantity)} × ${entry.portionLabel}`;
