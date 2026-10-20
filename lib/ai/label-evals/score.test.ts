import { describe, expect, it } from 'vitest';
import type {
  LabelReading,
  PrintedNutrient,
} from '../../domain/foods/label-reading.ts';
import { accuracy, addTallies, scoreReading } from './score.ts';

const printed = (
  nutrient: PrintedNutrient['nutrient'],
  amount: string,
  unit: PrintedNutrient['unit'] = 'g',
): PrintedNutrient => ({ nutrient, printed: amount, unit, confidence: 1 });

const expected: LabelReading = {
  productName: { value: 'Houmous extra', confidence: 1 },
  brand: null,
  netQuantity: { value: '175 g', confidence: 1 },
  servingSize: { label: null, amount: 30, unit: 'g', confidence: 1 },
  per100g: [
    printed('energy_kj', '1309', 'kJ'),
    printed('fat', '26,8'),
    printed('salt', '<0,01'),
    printed('fibre', '6,15'),
  ],
  perServing: [printed('fat', '8,0')],
  notes: [],
};

describe('scoreReading', () => {
  it('counts every field of a faithful reading as correct', () => {
    expect(scoreReading(expected, expected)).toEqual({
      eu: { correct: 3, total: 3 },
      other: { correct: 5, total: 5 },
      misses: [],
      extras: [],
    });
  });

  it('compares amounts by value, across decimal separators and units', () => {
    const reading: LabelReading = {
      ...expected,
      productName: { value: 'HOUMOUS  Extra', confidence: 0.4 },
      netQuantity: { value: '175g', confidence: 0.8 },
      per100g: [
        printed('energy_kj', '1309.0', 'kJ'),
        printed('fat', '26.80'),
        printed('salt', '< 0.01'),
        printed('fibre', '6150', 'mg'),
      ],
      perServing: [printed('fat', '8')],
    };

    expect(scoreReading(expected, reading).misses).toEqual([]);
  });

  it('names the fields read wrong or not at all, and those not expected', () => {
    const reading: LabelReading = {
      ...expected,
      productName: null,
      servingSize: { label: null, amount: 25, unit: 'g', confidence: 1 },
      per100g: [
        printed('energy_kj', '1306', 'kJ'),
        printed('fat', '26,8'),
        printed('salt', '0,01'),
        printed('sugars', '0,1'),
      ],
      perServing: [],
    };

    expect(scoreReading(expected, reading)).toEqual({
      eu: { correct: 1, total: 3 },
      other: { correct: 1, total: 5 },
      misses: [
        'per100g.energy_kj',
        'per100g.salt',
        'per100g.fibre',
        'perServing.fat',
        'productName',
        'servingSize',
      ],
      extras: ['per100g.sugars'],
    });
  });

  it('misses every field when there is no reading', () => {
    const score = scoreReading(expected, null);

    expect(score.eu).toEqual({ correct: 0, total: 3 });
    expect(score.other).toEqual({ correct: 0, total: 5 });
  });
});

describe('accuracy', () => {
  it('is the share correct over the tallies added up', () => {
    expect(
      accuracy(
        addTallies([
          { correct: 7, total: 8 },
          { correct: 2, total: 2 },
        ]),
      ),
    ).toBe(0.9);
  });

  it('is whole when there is nothing to score', () => {
    expect(accuracy(addTallies([]))).toBe(1);
  });
});
