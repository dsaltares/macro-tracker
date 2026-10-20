import type { NutrientKey } from '../nutrition/nutrients.ts';
import { kcalPerGram, kJ, type NutrientVector } from '../nutrition/vector.ts';
import { ageOn, type Profile, type Sex } from '../profile.ts';

export const ageBands = ['18-24', '25-50', '51-70', '71+'] as const;

export type AgeBand = (typeof ageBands)[number];

export const ageBandOf = (age: number): AgeBand => {
  if (age < 25) return '18-24';
  if (age <= 50) return '25-50';
  if (age <= 70) return '51-70';
  return '71+';
};

export type GoalKind = 'target' | 'upper';

export type DailyAmount =
  | { perDay: number }
  | { perMJ: number }
  | { fatEnergyShare: number };

export type DietaryReferenceValue = {
  kind: GoalKind;
  amounts: Record<Sex, Record<AgeBand, DailyAmount>>;
};

const perDay = (amount: number): DailyAmount => ({ perDay: amount });

const inEveryBand = (amount: DailyAmount) =>
  Object.fromEntries(ageBands.map((band) => [band, amount])) as Record<
    AgeBand,
    DailyAmount
  >;

const bySex = (female: DailyAmount, male: DailyAmount) => ({
  female: inEveryBand(female),
  male: inEveryBand(male),
});

const forEveryone = (amount: DailyAmount) => bySex(amount, amount);

const target = (
  amounts: DietaryReferenceValue['amounts'],
): DietaryReferenceValue => ({ kind: 'target', amounts });

const upper = (
  amounts: DietaryReferenceValue['amounts'],
): DietaryReferenceValue => ({ kind: 'upper', amounts });

const calciumByBand = {
  '18-24': perDay(1000),
  '25-50': perDay(950),
  '51-70': perDay(950),
  '71+': perDay(950),
};

export const dietaryReferenceValues = {
  fibre: target(forEveryone(perDay(25))),
  saturated_fat: upper(forEveryone({ fatEnergyShare: 0.1 })),
  sugars: upper(forEveryone(perDay(90))),

  sodium: upper(forEveryone(perDay(2000))),
  potassium: target(forEveryone(perDay(3500))),
  chloride: upper(forEveryone(perDay(3100))),
  calcium: target({ female: calciumByBand, male: calciumByBand }),
  phosphorus: target(forEveryone(perDay(550))),
  magnesium: target(bySex(perDay(300), perDay(350))),
  iron: target({
    female: {
      '18-24': perDay(16),
      '25-50': perDay(16),
      '51-70': perDay(11),
      '71+': perDay(11),
    },
    male: inEveryBand(perDay(11)),
  }),
  zinc: target(bySex(perDay(9.3), perDay(11.7))),
  copper: target(bySex(perDay(1.3), perDay(1.6))),
  manganese: target(forEveryone(perDay(3))),
  fluoride: target(bySex(perDay(2.9), perDay(3.4))),
  selenium: target(forEveryone(perDay(70))),
  chromium: target(forEveryone(perDay(40))),
  molybdenum: target(forEveryone(perDay(65))),
  iodine: target(forEveryone(perDay(150))),

  vitamin_a: target(bySex(perDay(650), perDay(750))),
  vitamin_d: target(forEveryone(perDay(15))),
  vitamin_e: target(bySex(perDay(11), perDay(13))),
  vitamin_k: target(forEveryone(perDay(70))),
  vitamin_c: target(bySex(perDay(95), perDay(110))),
  thiamin: target(forEveryone({ perMJ: 0.1 })),
  riboflavin: target(forEveryone(perDay(1.6))),
  niacin: target(forEveryone({ perMJ: 1.6 })),
  vitamin_b6: target(bySex(perDay(1.6), perDay(1.7))),
  folate: target(forEveryone(perDay(330))),
  vitamin_b12: target(forEveryone(perDay(4))),
  biotin: target(forEveryone(perDay(40))),
  pantothenic_acid: target(forEveryone(perDay(5))),
  choline: target(forEveryone(perDay(400))),
} as const satisfies Partial<Record<NutrientKey, DietaryReferenceValue>>;

const kJPerMJ = 1000;

export const dailyAmount = (amount: DailyAmount, kcal: number) => {
  if ('perDay' in amount) return amount.perDay;
  if ('perMJ' in amount) return (amount.perMJ * kJ(kcal)) / kJPerMJ;
  return (amount.fatEnergyShare * kcal) / kcalPerGram.fat;
};

const referenceValueOf: Partial<Record<NutrientKey, DietaryReferenceValue>> =
  dietaryReferenceValues;

export const goalKind = (key: NutrientKey): GoalKind =>
  referenceValueOf[key]?.kind ?? 'target';

export const defaultMicroGoals = (
  { sex, birthDate }: Pick<Profile, 'sex' | 'birthDate'>,
  date: string,
  kcal: number,
): NutrientVector => {
  const band = ageBandOf(ageOn(birthDate, date));
  return Object.fromEntries(
    Object.entries(dietaryReferenceValues).map(([key, { amounts }]) => [
      key,
      dailyAmount(amounts[sex][band], kcal),
    ]),
  );
};
