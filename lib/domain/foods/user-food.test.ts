import { describe, expect, it } from 'vitest';
import {
  aboveMaxPer100g,
  invalidBarcode,
  nutrientsAboveMax,
  per100gOfEntered,
  portionLabelTaken,
  takenPortionLabels,
  userFoodSchema,
} from './user-food.ts';

const granola = {
  name: 'Granola',
  brand: null,
  barcode: null,
  quantityLabel: null,
  nutrients: { energy_kcal: 450 },
  portions: [],
};

const issuesOf = (input: unknown) =>
  userFoodSchema
    .safeParse(input)
    .error?.issues.map(({ path, message }) => ({ path, message })) ?? [];

describe('per100gOfEntered', () => {
  it('keeps amounts entered per 100 g, rounded to two decimals', () => {
    expect(
      per100gOfEntered({ fat: 4.256, protein: 12 }, { per: '100g' }),
    ).toEqual({ fat: 4.26, protein: 12 });
  });

  it('scales amounts entered per serving to 100 g', () => {
    expect(
      per100gOfEntered(
        { energy_kcal: 120, fat: 4, sodium: 100 },
        { per: 'serving', grams: 30 },
      ),
    ).toEqual({ energy_kcal: 400, fat: 13.33, sodium: 333.33 });
  });
});

describe('nutrientsAboveMax', () => {
  it('flags any amount above what 100 g can hold in its unit', () => {
    expect(
      nutrientsAboveMax({
        energy_kcal: 901,
        fat: 100,
        protein: 100.5,
        sodium: 100_001,
        vitamin_d: 100_000_000,
      }),
    ).toEqual(['energy_kcal', 'protein', 'sodium']);
  });

  it('words the bound in the nutrient’s unit', () => {
    expect(aboveMaxPer100g('energy_kcal')).toBe('More than 900 kcal per 100 g');
    expect(aboveMaxPer100g('sodium')).toBe('More than 100,000 mg per 100 g');
  });
});

describe('takenPortionLabels', () => {
  it('flags a standard label and every repeat after the first', () => {
    expect(
      takenPortionLabels([
        { label: '1 bowl' },
        { label: '100 g' },
        { label: ' 1 bowl ' },
        { label: '1 cup' },
      ]),
    ).toEqual([1, 2]);
  });
});

describe('userFoodSchema', () => {
  it('trims text, empties to null and normalises a UPC-A barcode', () => {
    expect(
      userFoodSchema.parse({
        ...granola,
        name: '  Granola ',
        brand: ' ',
        barcode: '035650166738',
        quantityLabel: ' 500 g ',
      }),
    ).toMatchObject({
      name: 'Granola',
      brand: null,
      barcode: '0035650166738',
      quantityLabel: '500 g',
    });
    expect(userFoodSchema.parse({ ...granola, barcode: ' ' }).barcode).toBe(
      null,
    );
  });

  it('refuses an empty name and an invalid barcode', () => {
    expect(
      issuesOf({ ...granola, name: ' ', barcode: '3017620422004' }),
    ).toEqual([
      { path: ['name'], message: 'Enter a name' },
      { path: ['barcode'], message: invalidBarcode },
    ]);
  });

  it('refuses an amount above what 100 g can hold', () => {
    expect(issuesOf({ ...granola, nutrients: { fat: 120 } })).toEqual([
      { path: ['nutrients', 'fat'], message: aboveMaxPer100g('fat') },
    ]);
  });

  it('refuses a portion label the food already shows', () => {
    expect(
      issuesOf({
        ...granola,
        portions: [
          { label: '1 g', grams: 2 },
          { label: '1 bowl', grams: 45 },
        ],
      }),
    ).toEqual([{ path: ['portions', 0, 'label'], message: portionLabelTaken }]);
  });
});
