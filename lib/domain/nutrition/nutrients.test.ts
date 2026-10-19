import { describe, expect, it } from 'vitest';
import {
  euLabelKeys,
  nutrientByKey,
  nutrientGroups,
  nutrientKeys,
  nutrients,
} from './nutrients.ts';

const keysIn = (group: string) =>
  nutrients
    .filter((nutrient) => nutrient.group === group)
    .map(({ key }) => key);

describe('nutrients', () => {
  it('lists every group of docs/DOMAIN.md in display order', () => {
    expect(nutrientGroups.map(keysIn)).toEqual([
      ['energy_kcal'],
      ['protein', 'carbohydrate', 'fat', 'fibre', 'alcohol', 'water'],
      [
        'saturated_fat',
        'monounsaturated_fat',
        'polyunsaturated_fat',
        'trans_fat',
        'omega_3',
        'omega_6',
        'cholesterol',
      ],
      ['sugars', 'added_sugars', 'starch', 'polyols'],
      [
        'sodium',
        'potassium',
        'chloride',
        'calcium',
        'phosphorus',
        'magnesium',
        'iron',
        'zinc',
        'copper',
        'manganese',
        'fluoride',
        'selenium',
        'chromium',
        'molybdenum',
        'iodine',
      ],
      [
        'vitamin_a',
        'vitamin_d',
        'vitamin_e',
        'vitamin_k',
        'vitamin_c',
        'thiamin',
        'riboflavin',
        'niacin',
        'vitamin_b6',
        'folate',
        'vitamin_b12',
        'biotin',
        'pantothenic_acid',
        'choline',
      ],
      ['caffeine'],
    ]);
  });

  it('keeps each group contiguous, so the list itself is the display order', () => {
    expect(nutrientKeys).toEqual(nutrientGroups.flatMap(keysIn));
    expect(nutrients.map(({ order }) => order)).toEqual(
      nutrientKeys.map((_, index) => index),
    );
  });

  it('has no duplicate keys', () => {
    expect(new Set(nutrientKeys).size).toBe(nutrientKeys.length);
  });

  it('gives every nutrient its unit', () => {
    const keysByUnit = Object.groupBy(nutrients, ({ unit }) => unit);

    expect(keysByUnit.kcal?.map(({ key }) => key)).toEqual(['energy_kcal']);
    expect(keysByUnit.µg?.map(({ key }) => key)).toEqual([
      'selenium',
      'chromium',
      'molybdenum',
      'iodine',
      'vitamin_a',
      'vitamin_d',
      'vitamin_k',
      'folate',
      'vitamin_b12',
      'biotin',
    ]);
    expect(nutrientByKey.sodium.unit).toBe('mg');
    expect(nutrientByKey.cholesterol.unit).toBe('mg');
    expect(nutrientByKey.protein.unit).toBe('g');
  });

  it('flags the EU mandatory label, and lists it in label order', () => {
    expect(
      nutrients.filter(({ euMandatory }) => euMandatory).map(({ key }) => key),
    ).toEqual([
      'energy_kcal',
      'protein',
      'carbohydrate',
      'fat',
      'saturated_fat',
      'sugars',
      'sodium',
    ]);
    expect(euLabelKeys).toEqual([
      'energy_kcal',
      'fat',
      'saturated_fat',
      'carbohydrate',
      'sugars',
      'protein',
      'sodium',
    ]);
  });

  it('looks a nutrient up by key', () => {
    expect(nutrientByKey.fibre).toEqual({
      key: 'fibre',
      unit: 'g',
      group: 'macros',
      order: 4,
      euMandatory: false,
    });
  });
});
