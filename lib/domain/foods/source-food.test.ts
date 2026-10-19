import { describe, expect, it } from 'vitest';
import {
  normaliseNutrients,
  parseAmount,
  type SourceFood,
  sourceFoodSchema,
} from './source-food.ts';

const food: SourceFood = {
  source: 'off',
  sourceId: '3017620422003',
  barcode: '3017620422003',
  name: 'Hazelnut spread',
  originalName: null,
  brand: 'Brand',
  quantityLabel: '400 g',
  nutrients: { energy_kcal: 539, fat: 30.9, sodium: 42.8, sugars: 0 },
  traces: ['sugars'],
  portions: [{ label: '1 tbsp', grams: 15 }],
  lastModified: '2026-10-01T09:30:00.000Z',
};

const issuesOf = (candidate: unknown) =>
  sourceFoodSchema
    .safeParse(candidate)
    .error?.issues.map(({ path }) => path.join('.'));

describe('sourceFoodSchema', () => {
  it('accepts a complete food', () => {
    expect(sourceFoodSchema.parse(food)).toEqual(food);
  });

  it('accepts a generic food with no barcode, brand, quantity, portions or date', () => {
    const generic = {
      ...food,
      source: 'ciqual',
      sourceId: '20503',
      barcode: null,
      brand: null,
      quantityLabel: null,
      portions: [],
      traces: [],
      lastModified: null,
    };

    expect(sourceFoodSchema.parse(generic)).toEqual(generic);
  });

  it('accepts a food that knows no nutrient', () => {
    expect(issuesOf({ ...food, nutrients: {}, traces: [] })).toBeUndefined();
  });

  it('accepts only reference sources', () => {
    expect(issuesOf({ ...food, source: 'user' })).toEqual(['source']);
  });

  it('rejects a barcode that is not a valid EAN', () => {
    expect(issuesOf({ ...food, barcode: '3017620422004' })).toEqual([
      'barcode',
    ]);
    expect(issuesOf({ ...food, barcode: '036000291452' })).toEqual(['barcode']);
  });

  it('rejects an empty id, name, brand or quantity', () => {
    expect(
      issuesOf({
        ...food,
        sourceId: '',
        name: '',
        brand: '',
        quantityLabel: '',
      }),
    ).toEqual(['sourceId', 'name', 'brand', 'quantityLabel']);
  });

  it('rejects a key outside the canon', () => {
    expect(
      issuesOf({ ...food, nutrients: { ...food.nutrients, salt: 0.1 } }),
    ).toEqual(['nutrients']);
  });

  it('rejects a negative or non-finite amount', () => {
    expect(issuesOf({ ...food, nutrients: { protein: -1 } })).toContain(
      'nutrients.protein',
    );
    expect(issuesOf({ ...food, nutrients: { protein: Number.NaN } })).toContain(
      'nutrients.protein',
    );
    expect(
      issuesOf({ ...food, nutrients: { protein: Number.POSITIVE_INFINITY } }),
    ).toContain('nutrients.protein');
  });

  it('rejects a trace that is not stored as zero', () => {
    expect(issuesOf({ ...food, traces: ['fat'] })).toEqual(['traces']);
    expect(issuesOf({ ...food, traces: ['iron'] })).toEqual(['traces']);
  });

  it('rejects a portion of no grams', () => {
    expect(
      issuesOf({ ...food, portions: [{ label: '1 serving', grams: 0 }] }),
    ).toEqual(['portions.0.grams']);
  });

  it('rejects a last modified that is not an ISO timestamp', () => {
    expect(issuesOf({ ...food, lastModified: '2026-10-01' })).toEqual([
      'lastModified',
    ]);
  });

  it('rejects a field it does not know', () => {
    expect(issuesOf({ ...food, countries: ['en:spain'] })).toEqual(['']);
  });
});

describe('parseAmount', () => {
  it('takes a non-negative number as it is', () => {
    expect(parseAmount(12.5)).toEqual({ amount: 12.5, trace: false });
    expect(parseAmount(0)).toEqual({ amount: 0, trace: false });
  });

  it('parses a numeric string, with a decimal point or a decimal comma', () => {
    expect(parseAmount('12.5')).toEqual({ amount: 12.5, trace: false });
    expect(parseAmount(' 0,3 ')).toEqual({ amount: 0.3, trace: false });
  });

  it('reads "<" and "≤" as a trace: zero, flagged', () => {
    expect(parseAmount('<0.5')).toEqual({ amount: 0, trace: true });
    expect(parseAmount('< 0,1')).toEqual({ amount: 0, trace: true });
    expect(parseAmount('≤1')).toEqual({ amount: 0, trace: true });
  });

  it('reads "traces" and its abbreviations as a trace, in any case', () => {
    expect(parseAmount('traces')).toEqual({ amount: 0, trace: true });
    expect(parseAmount('Trace')).toEqual({ amount: 0, trace: true });
    expect(parseAmount('Tr')).toEqual({ amount: 0, trace: true });
  });

  it('is unknown for nothing, a blank, a marker or a negative', () => {
    expect(parseAmount(undefined)).toBeUndefined();
    expect(parseAmount(null)).toBeUndefined();
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('  ')).toBeUndefined();
    expect(parseAmount('-')).toBeUndefined();
    expect(parseAmount('N')).toBeUndefined();
    expect(parseAmount(-1)).toBeUndefined();
    expect(parseAmount('-1')).toBeUndefined();
    expect(parseAmount(Number.NaN)).toBeUndefined();
    expect(parseAmount(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('normaliseNutrients', () => {
  it('keeps canonical amounts as they are', () => {
    expect(
      normaliseNutrients({ energy_kcal: 539, protein: '6.3', iron: 4.2 }),
    ).toEqual({
      nutrients: { energy_kcal: 539, protein: 6.3, iron: 4.2 },
      traces: [],
    });
  });

  it('leaves out what it cannot read, never zero', () => {
    expect(
      normaliseNutrients({ energy_kcal: 100, fibre: '', sugars: 'N' }),
    ).toEqual({ nutrients: { energy_kcal: 100 }, traces: [] });
  });

  it('turns a trace into zero and flags it', () => {
    expect(
      normaliseNutrients({ energy_kcal: 899, sugars: '<0.5', fibre: 'traces' }),
    ).toEqual({
      nutrients: { energy_kcal: 899, sugars: 0, fibre: 0 },
      traces: ['sugars', 'fibre'],
    });
  });

  describe('energy', () => {
    it('derives kcal from kJ when only kJ is declared', () => {
      const { nutrients } = normaliseNutrients({ energy_kj: 2252 });

      expect(nutrients.energy_kcal).toBeCloseTo(538.24);
      expect(nutrients).not.toHaveProperty('energy_kj');
    });

    it('keeps the declared kcal when both are declared', () => {
      expect(
        normaliseNutrients({ energy_kcal: 539, energy_kj: 2000 }).nutrients,
      ).toEqual({ energy_kcal: 539 });
    });

    it('derives kcal from kJ when the declared kcal is unreadable', () => {
      expect(
        normaliseNutrients({ energy_kcal: '', energy_kj: 418.4 }).nutrients
          .energy_kcal,
      ).toBeCloseTo(100);
    });

    it('estimates kcal from the macros when no energy is declared', () => {
      expect(
        normaliseNutrients({ protein: 10, carbohydrate: 20, fat: 5 }).nutrients,
      ).toEqual({ protein: 10, carbohydrate: 20, fat: 5, energy_kcal: 165 });
    });

    it('stays unknown when neither energy nor any macro is', () => {
      expect(normaliseNutrients({ sugars: 3 }).nutrients).toEqual({
        sugars: 3,
      });
    });

    it('carries a trace through the conversion', () => {
      expect(normaliseNutrients({ energy_kj: '<1' })).toEqual({
        nutrients: { energy_kcal: 0 },
        traces: ['energy_kcal'],
      });
    });
  });

  describe('sodium', () => {
    it('derives sodium in mg from salt in g when only salt is declared', () => {
      expect(normaliseNutrients({ salt: 1.9 }).nutrients).toEqual({
        sodium: 760,
      });
    });

    it('keeps the declared sodium when both are declared, even if they disagree', () => {
      expect(normaliseNutrients({ salt: 1.9, sodium: 700 }).nutrients).toEqual({
        sodium: 700,
      });
    });

    it('carries a trace of salt over to sodium', () => {
      expect(normaliseNutrients({ salt: '<0.01' })).toEqual({
        nutrients: { sodium: 0 },
        traces: ['sodium'],
      });
    });
  });

  describe('per serving', () => {
    it('scales values declared for a serving to 100 g', () => {
      expect(
        normaliseNutrients(
          { energy_kcal: 120, protein: 9, salt: 0.3, sugars: '<0.5' },
          { per: 'serving', grams: 30 },
        ),
      ).toEqual({
        nutrients: { energy_kcal: 400, protein: 30, sodium: 400, sugars: 0 },
        traces: ['sugars'],
      });
    });

    it('scales an energy estimated from the macros too', () => {
      expect(
        normaliseNutrients({ protein: 5 }, { per: 'serving', grams: 50 })
          .nutrients,
      ).toEqual({ protein: 10, energy_kcal: 40 });
    });
  });
});
