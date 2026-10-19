import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DeclaredKey } from '../../../domain/foods/source-food.ts';
import { nutrientByKey } from '../../../domain/nutrition/nutrients.ts';
import {
  type CiqualComposition,
  ciqualConstituents,
  declaredFromCiqual,
  declaresEnergy,
  ignoredCiqualConstituents,
  sourceFoodFromCiqual,
} from './mapping.ts';
import { type XmlRecord, xmlRecords } from './xml.ts';

const recordsIn = async (path: string, tag: string) => {
  const records: XmlRecord[] = [];
  const bytes = new Uint8Array(await readFile(path));
  for await (const record of xmlRecords(
    (async function* () {
      yield bytes;
    })(),
    tag,
  )) {
    records.push(record);
  }
  return records;
};

let constituents: XmlRecord[] = [];
let compositions = new Map<string, Record<string, string>>();

beforeAll(async () => {
  constituents = await recordsIn('test/fixtures/ciqual/const.xml', 'CONST');
  compositions = new Map();
  for (const row of await recordsIn(
    'test/fixtures/ciqual/compo.xml',
    'COMPO',
  )) {
    const { alim_code: food = '', const_code: code = '', teneur } = row;
    const composition = compositions.get(food) ?? {};
    if (teneur !== undefined) {
      composition[code] = teneur;
    }
    compositions.set(food, composition);
  }
});

const realComposition = (code: string): CiqualComposition => {
  const composition = compositions.get(code);
  if (!composition) {
    throw new Error(`No real food ${code} in the fixture`);
  }
  return composition;
};

const mappedCodes = new Set(ciqualConstituents.map(({ code }) => code));
const ignoredCodes = new Set(ignoredCiqualConstituents);

const unitPer100g = /\(([^/()]+)\/100 ?m?g\)$/;
const derivedUnits: Partial<Record<DeclaredKey, string>> = {
  energy_kj: 'kJ',
  salt: 'g',
};
const unitOf = (declares: DeclaredKey) =>
  derivedUnits[declares] ??
  nutrientByKey[declares as keyof typeof nutrientByKey].unit;

const apple = {
  code: '13039',
  nameEnglish: 'Apple, flesh and skin, raw',
  nameFrench: 'Pomme, chair et peau, crue',
  lastModified: '2025-11-19T16:29:04.000Z',
};

describe('the CIQUAL constituent table', () => {
  it('reads exactly these constituents', () => {
    expect(
      ciqualConstituents.map(({ code, declares }) => [code, declares]),
    ).toEqual([
      ['328', 'energy_kcal'],
      ['327', 'energy_kj'],
      ['25000', 'protein'],
      ['31000', 'carbohydrate'],
      ['40000', 'fat'],
      ['34100', 'fibre'],
      ['60000', 'alcohol'],
      ['400', 'water'],
      ['40302', 'saturated_fat'],
      ['40303', 'monounsaturated_fat'],
      ['40304', 'polyunsaturated_fat'],
      ['75100', 'cholesterol'],
      ['32000', 'sugars'],
      ['33110', 'starch'],
      ['34000', 'polyols'],
      ['10110', 'sodium'],
      ['10004', 'salt'],
      ['10190', 'potassium'],
      ['10170', 'chloride'],
      ['10200', 'calcium'],
      ['10150', 'phosphorus'],
      ['10120', 'magnesium'],
      ['10260', 'iron'],
      ['10300', 'zinc'],
      ['10290', 'copper'],
      ['10251', 'manganese'],
      ['10340', 'selenium'],
      ['10530', 'iodine'],
      ['51104', 'vitamin_a'],
      ['52100', 'vitamin_d'],
      ['53100', 'vitamin_e'],
      ['54101', 'vitamin_k'],
      ['55100', 'vitamin_c'],
      ['56100', 'thiamin'],
      ['56200', 'riboflavin'],
      ['56310', 'niacin'],
      ['56500', 'vitamin_b6'],
      ['56700', 'folate'],
      ['56600', 'vitamin_b12'],
      ['56400', 'pantothenic_acid'],
    ]);
  });

  it('maps or ignores every constituent of the real table, and nothing else', () => {
    const real = constituents.map(({ const_code = '' }) => const_code);

    expect(real).toHaveLength(74);
    expect(real.filter((code) => code === '')).toEqual([]);
    expect(
      real.filter((code) => !mappedCodes.has(code) && !ignoredCodes.has(code)),
    ).toEqual([]);
    expect(
      [...mappedCodes, ...ignoredCodes].filter((code) => !real.includes(code)),
    ).toEqual([]);
  });

  it('never both maps and ignores a constituent, or maps one twice', () => {
    expect([...mappedCodes].filter((code) => ignoredCodes.has(code))).toEqual(
      [],
    );
    expect(mappedCodes.size).toBe(ciqualConstituents.length);
    expect(ignoredCodes.size).toBe(ignoredCiqualConstituents.length);
  });

  it('declares each one per 100 g in the unit the canon stores it in', () => {
    const named = new Map(
      constituents.map(({ const_code, const_nom_eng }) => [
        const_code,
        const_nom_eng,
      ]),
    );

    for (const { code, declares } of ciqualConstituents) {
      const name = named.get(code) ?? '';
      // CIQUAL 2025 labels retinol activity equivalent "µg/100mg"; its values are per 100 g.
      expect(name.match(unitPer100g)?.[1], `${code} ${name}`).toBe(
        unitOf(declares),
      );
    }
  });

  it('leaves out every canonical nutrient it has no single constituent for', () => {
    const declared = new Set(
      ciqualConstituents.map(({ declares }) => declares),
    );

    expect(
      Object.keys(nutrientByKey).filter(
        (key) => !declared.has(key as DeclaredKey),
      ),
    ).toEqual([
      'trans_fat',
      'omega_3',
      'omega_6',
      'added_sugars',
      'fluoride',
      'chromium',
      'molybdenum',
      'biotin',
      'choline',
      'caffeine',
    ]);
  });
});

describe('declaredFromCiqual', () => {
  it('reads each mapped constituent as written, and nothing else', () => {
    expect(
      declaredFromCiqual({ '328': '54', '400': '85,4', '32210': '5,1' }),
    ).toEqual({ energy_kcal: '54', water: '85,4' });
  });
});

describe('declaresEnergy', () => {
  it('holds for a food that declares its energy', () => {
    expect(declaresEnergy(realComposition('13039'))).toBe(true);
    expect(declaresEnergy({ '327': '229' })).toBe(true);
  });

  it('holds for a food that declares no energy but every energy macro', () => {
    expect(declaresEnergy(realComposition('12061'))).toBe(true);
  });

  it('fails for a food that declares neither', () => {
    expect(declaresEnergy(realComposition('6150'))).toBe(false);
    expect(declaresEnergy(realComposition('11057'))).toBe(false);
    expect(declaresEnergy({ '328': '-', '327': '-' })).toBe(false);
  });
});

describe('sourceFoodFromCiqual', () => {
  it('maps a real food to a source food, named in English and searchable in French', () => {
    const mapped = sourceFoodFromCiqual({
      ...apple,
      composition: realComposition('13039'),
    });

    expect(mapped).toEqual({
      success: true,
      food: expect.objectContaining({
        source: 'ciqual',
        sourceId: '13039',
        barcode: null,
        name: 'Apple, flesh and skin, raw',
        originalName: 'Pomme, chair et peau, crue',
        brand: null,
        quantityLabel: null,
        portions: [],
        lastModified: '2025-11-19T16:29:04.000Z',
      }),
    });
    expect(mapped.success && mapped.food.nutrients).toMatchObject({
      energy_kcal: 54,
      protein: 0.25,
      carbohydrate: 11.6,
      fat: 0.25,
      fibre: 1.4,
      water: 85.4,
      sugars: 10.6,
      saturated_fat: 0.052,
      sodium: 1.5,
      iodine: 0.37,
      vitamin_a: 1.78,
      vitamin_d: 0,
      alcohol: 0,
    });
  });

  it('keeps a constituent below its limit or in traces as a trace, and leaves out a missing one', () => {
    const mapped = sourceFoodFromCiqual({
      ...apple,
      code: '1031',
      composition: realComposition('1031'),
    });

    expect(mapped.success && mapped.food.traces.sort()).toEqual([
      'polyols',
      'selenium',
      'vitamin_c',
      'vitamin_d',
    ]);
    expect(mapped.success && mapped.food.nutrients).toMatchObject({
      polyols: 0,
      selenium: 0,
      vitamin_c: 0,
      vitamin_d: 0,
    });
    expect(mapped.success && mapped.food.nutrients).not.toHaveProperty(
      'vitamin_a',
    );
    expect(mapped.success && mapped.food.nutrients).not.toHaveProperty(
      'vitamin_b12',
    );
  });

  it('derives the energy of a food that declares only its macros', () => {
    const mapped = sourceFoodFromCiqual({
      ...apple,
      code: '12061',
      composition: realComposition('12061'),
    });

    expect(mapped.success && mapped.food.nutrients.energy_kcal).toBeCloseTo(
      16.3 * 4 + 0.83 * 4 + 21.8 * 9,
    );
  });

  it('falls back to the French name when there is no English one', () => {
    const mapped = sourceFoodFromCiqual({
      ...apple,
      nameEnglish: undefined,
      composition: { '328': '54' },
    });

    expect(mapped.success && mapped.food).toMatchObject({
      name: 'Pomme, chair et peau, crue',
      originalName: 'Pomme, chair et peau, crue',
    });
  });

  it('rejects a food with no name at all', () => {
    expect(
      sourceFoodFromCiqual({
        ...apple,
        nameEnglish: undefined,
        nameFrench: undefined,
        composition: { '328': '54' },
      }),
    ).toEqual({
      success: false,
      reason: expect.stringMatching(/^13039: .*name/s),
    });
  });
});
