import { describe, expect, it } from 'vitest';
import { readLabelFixtures } from './fixtures.ts';
import { euMandatoryNutrients } from './score.ts';

const fixtures = readLabelFixtures();

const declaredOnEveryLabel = [
  'energy_kj',
  'energy_kcal',
  'fat',
  'saturated_fat',
  'carbohydrate',
  'sugars',
  'protein',
];

describe('the label fixtures', () => {
  it('are about fifteen photos, each with its expected reading', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s declares the EU label per 100 g',
    (_, { expected }) => {
      const nutrients = expected.per100g.map(({ nutrient }) => nutrient);

      expect(nutrients).toEqual(expect.arrayContaining(declaredOnEveryLabel));
      expect(
        nutrients.some(
          (nutrient) => nutrient === 'salt' || nutrient === 'sodium',
        ),
      ).toBe(true);
      expect(
        nutrients.filter((nutrient) => euMandatoryNutrients.has(nutrient)),
      ).toHaveLength(8);
    },
  );

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s is a JPEG',
    (_, { photo }) => {
      expect([...photo.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    },
  );
});
