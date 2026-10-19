import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nutrientKeys } from './nutrients.ts';
import {
  forGrams,
  kcal,
  kcalFromMacros,
  kJ,
  type NutrientVector,
  per100gFrom,
  salt,
  scale,
  sodium,
  sum,
} from './vector.ts';

const amount = fc.double({ min: 0, max: 10_000, noNaN: true });
const factor = fc.double({ min: 0, max: 100, noNaN: true });

const vector: fc.Arbitrary<NutrientVector> = fc.dictionary(
  fc.constantFrom(...nutrientKeys),
  amount,
);

const tolerance = 1e-9;

const expectClose = (actual: NutrientVector, expected: NutrientVector) => {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [key, value] of Object.entries(expected)) {
    const scaleOfValue = Math.max(1, Math.abs(value));
    expect(
      Math.abs((actual[key as keyof NutrientVector] ?? Number.NaN) - value),
    ).toBeLessThanOrEqual(tolerance * scaleOfValue);
  }
};

describe('scale', () => {
  it('multiplies every amount it holds', () => {
    expect(scale({ protein: 10, sodium: 400 }, 1.5)).toEqual({
      protein: 15,
      sodium: 600,
    });
  });

  it('keeps an absent nutrient absent, never zero', () => {
    expect(scale({ protein: 10 }, 2)).toEqual({ protein: 20 });
    expect(scale({}, 2)).toEqual({});
  });

  it('does not change the vector it scales', () => {
    const per100g = { fat: 3 };

    scale(per100g, 2);

    expect(per100g).toEqual({ fat: 3 });
  });

  it('distributes over sum: sum([scale(v, a), scale(v, b)]) is scale(v, a + b)', () => {
    fc.assert(
      fc.property(vector, factor, factor, (v, a, b) => {
        expectClose(sum([scale(v, a), scale(v, b)]), scale(v, a + b));
      }),
    );
  });

  it('composes: scale(scale(v, a), b) is scale(v, a * b)', () => {
    fc.assert(
      fc.property(vector, factor, factor, (v, a, b) => {
        expectClose(scale(scale(v, a), b), scale(v, a * b));
      }),
    );
  });

  it('is the identity at 1', () => {
    fc.assert(
      fc.property(vector, (v) => {
        expect(scale(v, 1)).toEqual(v);
      }),
    );
  });
});

describe('sum', () => {
  it('adds amounts key by key', () => {
    expect(
      sum([
        { energy_kcal: 100, protein: 5 },
        { energy_kcal: 250, protein: 10 },
      ]),
    ).toEqual({ energy_kcal: 350, protein: 15 });
  });

  it('sums what is known and leaves out what no vector knows', () => {
    expect(
      sum([{ protein: 5 }, { fat: 2 }, { protein: 1, iron: 0.5 }]),
    ).toEqual({ protein: 6, fat: 2, iron: 0.5 });
  });

  it('is empty over no vectors', () => {
    expect(sum([])).toEqual({});
  });

  it('does not depend on the order of its vectors', () => {
    fc.assert(
      fc.property(fc.array(vector, { maxLength: 8 }), (vectors) => {
        expectClose(sum(vectors.toReversed()), sum(vectors));
      }),
    );
  });

  it('does not change the vectors it sums', () => {
    const first = { protein: 5 };

    sum([first, { protein: 1 }]);

    expect(first).toEqual({ protein: 5 });
  });
});

describe('forGrams', () => {
  it('scales a per-100 g vector to a weight', () => {
    expect(forGrams({ energy_kcal: 200, sodium: 500 }, 30)).toEqual({
      energy_kcal: 60,
      sodium: 150,
    });
  });

  it('is the vector itself at 100 g', () => {
    fc.assert(
      fc.property(vector, (per100g) => {
        expectClose(forGrams(per100g, 100), per100g);
      }),
    );
  });
});

describe('per100gFrom', () => {
  it('scales a vector for a weight to 100 g', () => {
    expect(per100gFrom({ energy_kcal: 60, sodium: 150 }, 30)).toEqual({
      energy_kcal: 200,
      sodium: 500,
    });
  });

  it('undoes forGrams', () => {
    fc.assert(
      fc.property(
        vector,
        fc.double({ min: 1, max: 1000, noNaN: true }),
        (per100g, grams) => {
          expectClose(per100gFrom(forGrams(per100g, grams), grams), per100g);
        },
      ),
    );
  });
});

describe('kcalFromMacros', () => {
  it('counts 4 kcal per g of protein and carbohydrate, 9 of fat and 7 of alcohol', () => {
    expect(
      kcalFromMacros({ protein: 10, carbohydrate: 20, fat: 5, alcohol: 2 }),
    ).toBe(40 + 80 + 45 + 14);
  });

  it('counts only the macros it knows', () => {
    expect(kcalFromMacros({ protein: 10, fibre: 30 })).toBe(40);
  });

  it('is unknown when no energy macro is', () => {
    expect(kcalFromMacros({ fibre: 3, sugars: 2 })).toBeUndefined();
    expect(kcalFromMacros({})).toBeUndefined();
  });

  it('is zero, not unknown, for macros known to be zero', () => {
    expect(kcalFromMacros({ fat: 0 })).toBe(0);
  });
});

describe('kJ', () => {
  it('is 4.184 kJ per kcal', () => {
    expect(kJ(100)).toBeCloseTo(418.4);
    expect(kJ(0)).toBe(0);
  });
});

describe('kcal', () => {
  it('is 1 kcal per 4.184 kJ', () => {
    expect(kcal(418.4)).toBeCloseTo(100);
    expect(kcal(0)).toBe(0);
  });

  it('round-trips with kJ', () => {
    fc.assert(
      fc.property(amount, (energy) => {
        expect(kcal(kJ(energy))).toBeCloseTo(energy, 9);
      }),
    );
  });
});

describe('salt and sodium', () => {
  it('derives salt in g from sodium in mg at × 2.5', () => {
    expect(salt(400)).toBe(1);
    expect(salt(0)).toBe(0);
  });

  it('derives sodium in mg from salt in g', () => {
    expect(sodium(1)).toBe(400);
    expect(sodium(2.5)).toBe(1000);
  });

  it('round-trips', () => {
    fc.assert(
      fc.property(amount, (sodiumMg) => {
        expect(sodium(salt(sodiumMg))).toBeCloseTo(sodiumMg, 9);
      }),
    );
  });
});
