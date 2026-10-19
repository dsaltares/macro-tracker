import { z } from 'zod';
import {
  type DeclaredKey,
  type DeclaredNutrients,
  normaliseNutrients,
  parseAmount,
  type SourceFood,
  sourceFoodSchema,
} from '../../../domain/foods/source-food.ts';

export type CiqualConstituent = {
  code: string;
  declares: DeclaredKey;
};

export const ciqualConstituents: readonly CiqualConstituent[] = [
  { code: '328', declares: 'energy_kcal' },
  { code: '327', declares: 'energy_kj' },

  { code: '25000', declares: 'protein' },
  { code: '31000', declares: 'carbohydrate' },
  { code: '40000', declares: 'fat' },
  { code: '34100', declares: 'fibre' },
  { code: '60000', declares: 'alcohol' },
  { code: '400', declares: 'water' },

  { code: '40302', declares: 'saturated_fat' },
  { code: '40303', declares: 'monounsaturated_fat' },
  { code: '40304', declares: 'polyunsaturated_fat' },
  { code: '75100', declares: 'cholesterol' },

  { code: '32000', declares: 'sugars' },
  { code: '33110', declares: 'starch' },
  { code: '34000', declares: 'polyols' },

  { code: '10110', declares: 'sodium' },
  { code: '10004', declares: 'salt' },
  { code: '10190', declares: 'potassium' },
  { code: '10170', declares: 'chloride' },
  { code: '10200', declares: 'calcium' },
  { code: '10150', declares: 'phosphorus' },
  { code: '10120', declares: 'magnesium' },
  { code: '10260', declares: 'iron' },
  { code: '10300', declares: 'zinc' },
  { code: '10290', declares: 'copper' },
  { code: '10251', declares: 'manganese' },
  { code: '10340', declares: 'selenium' },
  { code: '10530', declares: 'iodine' },

  { code: '51104', declares: 'vitamin_a' },
  { code: '52100', declares: 'vitamin_d' },
  { code: '53100', declares: 'vitamin_e' },
  { code: '54101', declares: 'vitamin_k' },
  { code: '55100', declares: 'vitamin_c' },
  { code: '56100', declares: 'thiamin' },
  { code: '56200', declares: 'riboflavin' },
  { code: '56310', declares: 'niacin' },
  { code: '56500', declares: 'vitamin_b6' },
  { code: '56700', declares: 'folate' },
  { code: '56600', declares: 'vitamin_b12' },
  { code: '56400', declares: 'pantothenic_acid' },
];

export const ignoredCiqualConstituents: readonly string[] = [
  '332',
  '333',
  '10000',
  '25003',
  '32210',
  '32220',
  '32250',
  '32410',
  '32430',
  '32480',
  '40400',
  '40600',
  '40800',
  '41000',
  '41200',
  '41400',
  '41600',
  '41800',
  '41819',
  '41826',
  '41833',
  '42046',
  '42053',
  '42263',
  '51200',
  '51330',
  '52200',
  '52300',
  '54104',
  '56702',
  '56704',
  '56708',
  '65000',
  '71010',
];

export type CiqualComposition = Readonly<Record<string, string>>;

export const declaredFromCiqual = (
  composition: CiqualComposition,
): DeclaredNutrients =>
  Object.fromEntries(
    ciqualConstituents.flatMap(({ code, declares }) => {
      const content = composition[code];
      return content === undefined ? [] : [[declares, content]];
    }),
  );

const declaredEnergy: readonly DeclaredKey[] = ['energy_kcal', 'energy_kj'];
const energyMacros: readonly DeclaredKey[] = ['protein', 'carbohydrate', 'fat'];

export const declaresEnergy = (composition: CiqualComposition) => {
  const declared = declaredFromCiqual(composition);
  const declares = (key: DeclaredKey) =>
    parseAmount(declared[key]) !== undefined;
  return declaredEnergy.some(declares) || energyMacros.every(declares);
};

export type CiqualFood = {
  code: string;
  nameEnglish: string | undefined;
  nameFrench: string | undefined;
  composition: CiqualComposition;
  lastModified: string | null;
};

export type CiqualMapping =
  | { success: true; food: SourceFood }
  | { success: false; reason: string };

export const sourceFoodFromCiqual = ({
  code,
  nameEnglish,
  nameFrench,
  composition,
  lastModified,
}: CiqualFood): CiqualMapping => {
  const parsed = sourceFoodSchema.safeParse({
    source: 'ciqual',
    sourceId: code,
    barcode: null,
    name: nameEnglish ?? nameFrench,
    originalName: nameFrench ?? null,
    brand: null,
    quantityLabel: null,
    ...normaliseNutrients(declaredFromCiqual(composition)),
    portions: [],
    lastModified,
  });
  return parsed.success
    ? { success: true, food: parsed.data }
    : { success: false, reason: `${code}: ${z.prettifyError(parsed.error)}` };
};
