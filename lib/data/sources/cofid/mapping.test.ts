import { readSheet } from 'read-excel-file/node';
import { describe, expect, it } from 'vitest';
import {
  type NutrientKey,
  nutrientByKey,
  nutrientKeys,
} from '../../../domain/nutrition/nutrients.ts';
import {
  type CofidFood,
  type CofidSheet,
  cofidNutrients,
  cofidSheets,
  declaredFromCofid,
  ignoredCofidColumns,
  sourceFoodFromCofid,
} from './mapping.ts';

const samplePath = 'test/fixtures/cofid/sample.xlsx';
const titleRow = 0;
const columnCodesRow = 1;
const firstNutrientColumn = 7;

const headerOf = async (sheet: CofidSheet) => {
  const data = await readSheet(samplePath, sheet);
  const titles = data[titleRow] ?? [];
  return (data[columnCodesRow] ?? []).flatMap((code, at) =>
    at >= firstNutrientColumn && typeof code === 'string'
      ? [{ code, title: String(titles[at]) }]
      : [],
  );
};

const unitInTitle = /\(([^()]+)\)$/;

const food = (values: CofidFood['values']): CofidFood => ({
  code: '18-323',
  name: 'Chicken, breast, grilled without skin, meat only',
  values,
  lastModified: null,
});

const mapped = (values: CofidFood['values']) => {
  const result = sourceFoodFromCofid(food(values));
  if (!result.success) {
    throw new Error(result.reason);
  }
  return result.food;
};

describe('the CoFID nutrient table', () => {
  it('reads exactly these columns, in this order of precedence', () => {
    expect(
      cofidNutrients.map(({ sheet, column, declares }) => [
        sheet,
        column,
        declares,
      ]),
    ).toEqual([
      ['1.3 Proximates', 'KCALS', 'energy_kcal'],
      ['1.3 Proximates', 'KJ', 'energy_kj'],
      ['1.3 Proximates', 'PROT', 'protein'],
      ['1.3 Proximates', 'CHO', 'carbohydrate'],
      ['1.3 Proximates', 'FAT', 'fat'],
      ['1.3 Proximates', 'AOACFIB', 'fibre'],
      ['1.3 Proximates', 'ENGFIB', 'fibre'],
      ['1.3 Proximates', 'ALCO', 'alcohol'],
      ['1.3 Proximates', 'WATER', 'water'],
      ['1.3 Proximates', 'SATFOD', 'saturated_fat'],
      ['1.3 Proximates', 'MONOFOD', 'monounsaturated_fat'],
      ['1.3 Proximates', 'MONOFODc', 'monounsaturated_fat'],
      ['1.3 Proximates', 'POLYFOD', 'polyunsaturated_fat'],
      ['1.3 Proximates', 'POLYFODc', 'polyunsaturated_fat'],
      ['1.3 Proximates', 'FODTRANS', 'trans_fat'],
      ['1.3 Proximates', 'TOTn3PFOD', 'omega_3'],
      ['1.3 Proximates', 'TOTn6PFOD', 'omega_6'],
      ['1.3 Proximates', 'CHOL', 'cholesterol'],
      ['1.3 Proximates', 'TOTSUG', 'sugars'],
      ['1.3 Proximates', 'STAR', 'starch'],
      ['1.4 Inorganics', 'NA', 'sodium'],
      ['1.4 Inorganics', 'K', 'potassium'],
      ['1.4 Inorganics', 'CL', 'chloride'],
      ['1.4 Inorganics', 'CA', 'calcium'],
      ['1.4 Inorganics', 'P', 'phosphorus'],
      ['1.4 Inorganics', 'MG', 'magnesium'],
      ['1.4 Inorganics', 'FE', 'iron'],
      ['1.4 Inorganics', 'ZN', 'zinc'],
      ['1.4 Inorganics', 'CU', 'copper'],
      ['1.4 Inorganics', 'MN', 'manganese'],
      ['1.4 Inorganics', 'SE', 'selenium'],
      ['1.4 Inorganics', 'I', 'iodine'],
      ['1.5 Vitamins', 'RETEQU', 'vitamin_a'],
      ['1.5 Vitamins', 'VITD', 'vitamin_d'],
      ['1.5 Vitamins', 'VITE', 'vitamin_e'],
      ['1.5 Vitamins', 'VITK1', 'vitamin_k'],
      ['1.5 Vitamins', 'VITC', 'vitamin_c'],
      ['1.5 Vitamins', 'THIA', 'thiamin'],
      ['1.5 Vitamins', 'RIBO', 'riboflavin'],
      ['1.5 Vitamins', 'NIAC', 'niacin'],
      ['1.5 Vitamins', 'VITB6', 'vitamin_b6'],
      ['1.5 Vitamins', 'FOLT', 'folate'],
      ['1.5 Vitamins', 'VITB12', 'vitamin_b12'],
      ['1.5 Vitamins', 'BIOT', 'biotin'],
      ['1.5 Vitamins', 'PANTO', 'pantothenic_acid'],
    ]);
  });

  it.each(cofidSheets)(
    'maps or deliberately ignores every nutrient column of %s',
    async (sheet) => {
      const mappedColumns = new Set(
        cofidNutrients
          .filter((nutrient) => nutrient.sheet === sheet)
          .map(({ column }) => column),
      );
      const ignored = new Set(ignoredCofidColumns[sheet]);

      const header = await headerOf(sheet);

      expect(header.length).toBeGreaterThan(10);
      expect(
        header
          .map(({ code }) => code)
          .filter((code) => !mappedColumns.has(code) && !ignored.has(code)),
      ).toEqual([]);
      expect([...ignored].filter((code) => mappedColumns.has(code))).toEqual(
        [],
      );
    },
  );

  it('reads every column in the canonical unit of the nutrient it declares', async () => {
    const units = new Map<string, string>();
    for (const sheet of cofidSheets) {
      for (const { code, title } of await headerOf(sheet)) {
        units.set(code, unitInTitle.exec(title)?.[1] ?? '');
      }
    }

    for (const { column, declares } of cofidNutrients) {
      expect(units.get(column), column).toBe(
        declares === 'energy_kj'
          ? 'kJ'
          : nutrientByKey[declares as NutrientKey].unit,
      );
    }
  });

  it('has no column for these canonical nutrients', () => {
    const declared = new Set(cofidNutrients.map(({ declares }) => declares));

    expect(nutrientKeys.filter((key) => !declared.has(key))).toEqual([
      'added_sugars',
      'polyols',
      'fluoride',
      'chromium',
      'molybdenum',
      'choline',
      'caffeine',
    ]);
  });
});

describe('declaredFromCofid', () => {
  it('prefers AOAC fibre, and falls back to non-starch polysaccharide', () => {
    expect(declaredFromCofid({ AOACFIB: '2.4', ENGFIB: '1.8' })).toEqual({
      fibre: '2.4',
    });
    expect(declaredFromCofid({ AOACFIB: 'N', ENGFIB: '1.8' })).toEqual({
      fibre: '1.8',
    });
  });

  it('prefers total monounsaturated and polyunsaturated fat, and falls back to the cis fractions', () => {
    expect(
      declaredFromCofid({
        MONOFOD: 'N',
        MONOFODc: '7.11',
        POLYFOD: '0.62',
        POLYFODc: '0.60',
      }),
    ).toEqual({ monounsaturated_fat: '7.11', polyunsaturated_fat: '0.62' });
  });
});

describe('sourceFoodFromCofid', () => {
  it('maps a CoFID food to a generic food with no barcode, brand or portions', () => {
    expect(
      sourceFoodFromCofid({
        ...food({ KCALS: '148', PROT: '32.0', NA: '55', NIAC: '15.8' }),
        lastModified: '2021-03-18T17:19:13.000Z',
      }),
    ).toEqual({
      success: true,
      food: {
        source: 'cofid',
        sourceId: '18-323',
        barcode: null,
        name: 'Chicken, breast, grilled without skin, meat only',
        brand: null,
        quantityLabel: null,
        nutrients: { energy_kcal: 148, protein: 32, sodium: 55, niacin: 15.8 },
        traces: [],
        portions: [],
        lastModified: '2021-03-18T17:19:13.000Z',
      },
    });
  });

  it('stores Tr as a zero flagged as a trace', () => {
    const mappedFood = mapped({ KCALS: 151, STAR: 'Tr', I: 'Tr' });

    expect(mappedFood.nutrients).toEqual({
      energy_kcal: 151,
      starch: 0,
      iodine: 0,
    });
    expect(mappedFood.traces).toEqual(['starch', 'iodine']);
  });

  it('leaves out a nutrient CoFID marks N, present but not measured, or leaves blank', () => {
    expect(
      mapped({ KCALS: '151', SATFOD: 'N', VITE: null, VITK1: undefined })
        .nutrients,
    ).toEqual({ energy_kcal: 151 });
  });

  it('derives kcal from kJ when only kJ is declared', () => {
    expect(
      mapped({ KCALS: 'N', KJ: '418.4' }).nutrients.energy_kcal,
    ).toBeCloseTo(100);
  });

  it('leaves energy out when CoFID does not know it, rather than guess it from the macros it does', () => {
    expect(
      mapped({ KCALS: 'N', KJ: 'N', PROT: '10.4', FAT: '3.3', CHO: 'N' })
        .nutrients,
    ).toEqual({ protein: 10.4, fat: 3.3 });
  });

  it('rejects a food with no name', () => {
    expect(sourceFoodFromCofid({ ...food({}), name: '' })).toEqual({
      success: false,
      reason: expect.stringContaining('18-323: '),
    });
  });
});
