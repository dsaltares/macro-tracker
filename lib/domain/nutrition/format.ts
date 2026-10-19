import type { NutrientUnit } from './nutrients.ts';

const decimalsByUnit = {
  kcal: 0,
  g: 1,
  mg: 0,
  µg: 0,
} as const satisfies Record<NutrientUnit, number>;

const formatters = Object.fromEntries(
  Object.entries(decimalsByUnit).map(([unit, decimals]) => [
    unit,
    new Intl.NumberFormat('en', { maximumFractionDigits: decimals }),
  ]),
) as Record<NutrientUnit, Intl.NumberFormat>;

const withoutNegativeZero = (value: number) => value + 0;

export const roundAmount = (amount: number, unit: NutrientUnit) => {
  const factor = 10 ** decimalsByUnit[unit];
  return withoutNegativeZero(Math.round(amount * factor) / factor);
};

export const formatAmount = (amount: number, unit: NutrientUnit) =>
  `${formatters[unit].format(roundAmount(amount, unit))} ${unit}`;
