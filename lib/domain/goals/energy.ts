import {
  type ActivityLevel,
  activityMultipliers,
  ageOn,
  type Profile,
  type Sex,
} from '../profile.ts';

export const kcalPerKgOfBodyWeight = 7700;

const daysPerWeek = 7;

export const minimumKcal: Record<Sex, number> = {
  female: 1200,
  male: 1500,
};

export const maximumWeeklyRateKg = 1;

const sexOffsets: Record<Sex, number> = {
  female: -161,
  male: 5,
};

export const bmr = (
  { sex, birthDate, heightCm }: Pick<Profile, 'sex' | 'birthDate' | 'heightCm'>,
  weightKg: number,
  date: string,
) =>
  10 * weightKg +
  6.25 * heightCm -
  5 * ageOn(birthDate, date) +
  sexOffsets[sex];

export const tdee = (bmr: number, activityLevel: ActivityLevel) =>
  bmr * activityMultipliers[activityLevel];

export const kcalTarget = (tdee: number, weeklyRateKg: number) =>
  tdee + (weeklyRateKg * kcalPerKgOfBodyWeight) / daysPerWeek;

export type EnergyWarning = 'energy_below_minimum' | 'rate_above_maximum';

export const energyWarnings = (
  sex: Sex,
  kcal: number,
  weeklyRateKg: number,
): EnergyWarning[] => [
  ...(kcal < minimumKcal[sex] ? (['energy_below_minimum'] as const) : []),
  ...(Math.abs(weeklyRateKg) > maximumWeeklyRateKg
    ? (['rate_above_maximum'] as const)
    : []),
];

export type EnergyGoal = {
  bmr: number;
  tdee: number;
  kcal: number;
  warnings: EnergyWarning[];
};

export const energyGoal = (
  profile: Profile,
  weightKg: number,
  date: string,
  weeklyRateKg: number,
): EnergyGoal => {
  const basal = bmr(profile, weightKg, date);
  const expenditure = tdee(basal, profile.activityLevel);
  const kcal = kcalTarget(expenditure, weeklyRateKg);
  return {
    bmr: basal,
    tdee: expenditure,
    kcal,
    warnings: energyWarnings(profile.sex, kcal, weeklyRateKg),
  };
};
