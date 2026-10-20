import { describe, expect, it } from 'vitest';
import { type NutrientKey, nutrients } from '../nutrition/nutrients.ts';
import type { Profile } from '../profile.ts';
import { sexes } from '../profile.ts';
import {
  ageBandOf,
  ageBands,
  type DietaryReferenceValue,
  dailyAmount,
  defaultMicroGoals,
  dietaryReferenceValues,
  goalKind,
} from './drv.ts';

const today = '2026-10-20';

const woman = (birthDate: string): Profile => ({
  sex: 'female',
  birthDate,
  heightCm: 168,
  activityLevel: 'moderate',
});

const man = (birthDate: string): Profile => ({
  ...woman(birthDate),
  sex: 'male',
});

const mineralAndVitaminKeys = nutrients
  .filter(({ group }) => group === 'minerals' || group === 'vitamins')
  .map(({ key }) => key);

const referenceValues: Partial<Record<NutrientKey, DietaryReferenceValue>> =
  dietaryReferenceValues;

describe('dietaryReferenceValues', () => {
  it('has a value for every mineral and vitamin, for every sex and age band', () => {
    for (const key of mineralAndVitaminKeys) {
      const value: Partial<DietaryReferenceValue> = referenceValues[key] ?? {};
      for (const sex of sexes) {
        for (const band of ageBands) {
          expect(
            value.amounts?.[sex][band],
            `${key} ${sex} ${band}`,
          ).toBeDefined();
        }
      }
    }
  });

  it('covers fibre, saturated fat and sugars besides the minerals and vitamins', () => {
    expect(Object.keys(dietaryReferenceValues).sort()).toEqual(
      [...mineralAndVitaminKeys, 'fibre', 'saturated_fat', 'sugars'].sort(),
    );
  });
});

describe('ageBandOf', () => {
  it('puts an age in the EFSA adult band it falls in', () => {
    expect(ageBandOf(18)).toBe('18-24');
    expect(ageBandOf(24)).toBe('18-24');
    expect(ageBandOf(25)).toBe('25-50');
    expect(ageBandOf(50)).toBe('25-50');
    expect(ageBandOf(51)).toBe('51-70');
    expect(ageBandOf(70)).toBe('51-70');
    expect(ageBandOf(71)).toBe('71+');
    expect(ageBandOf(120)).toBe('71+');
  });

  it('puts the 16 and 17 year olds an account can be in the youngest band', () => {
    expect(ageBandOf(16)).toBe('18-24');
  });
});

describe('dailyAmount', () => {
  it('is an amount per day as it is', () => {
    expect(dailyAmount({ perDay: 95 }, 2000)).toBe(95);
  });

  it('scales an amount per MJ by the energy', () => {
    expect(dailyAmount({ perMJ: 0.1 }, 2000)).toBeCloseTo(0.8368);
  });

  it('turns a share of energy into grams of fat', () => {
    expect(dailyAmount({ fatEnergyShare: 0.1 }, 1800)).toBe(20);
  });
});

describe('goalKind', () => {
  it('is upper for what to keep under: saturated fat, sugars, sodium and chloride', () => {
    expect(goalKind('saturated_fat')).toBe('upper');
    expect(goalKind('sugars')).toBe('upper');
    expect(goalKind('sodium')).toBe('upper');
    expect(goalKind('chloride')).toBe('upper');
  });

  it('is target for what to reach, with or without a reference value', () => {
    expect(goalKind('vitamin_c')).toBe('target');
    expect(goalKind('fibre')).toBe('target');
    expect(goalKind('protein')).toBe('target');
    expect(goalKind('energy_kcal')).toBe('target');
  });
});

describe('defaultMicroGoals', () => {
  it('matches the EFSA table for a woman of 36', () => {
    const goals = defaultMicroGoals(woman('1990-06-15'), today, 2000);

    expect(goals).toMatchObject({
      calcium: 950,
      iron: 16,
      magnesium: 300,
      zinc: 9.3,
      copper: 1.3,
      fluoride: 2.9,
      iodine: 150,
      selenium: 70,
      potassium: 3500,
      vitamin_a: 650,
      vitamin_c: 95,
      vitamin_d: 15,
      vitamin_e: 11,
      vitamin_b6: 1.6,
      folate: 330,
      vitamin_b12: 4,
      riboflavin: 1.6,
      choline: 400,
      fibre: 25,
      sodium: 2000,
      chloride: 3100,
    });
  });

  it('matches the EFSA table for a man of 41', () => {
    const goals = defaultMicroGoals(man('1985-03-01'), today, 2500);

    expect(goals).toMatchObject({
      calcium: 950,
      iron: 11,
      magnesium: 350,
      zinc: 11.7,
      copper: 1.6,
      fluoride: 3.4,
      vitamin_a: 750,
      vitamin_c: 110,
      vitamin_e: 13,
      vitamin_b6: 1.7,
    });
  });

  it('gives adults under 25 more calcium', () => {
    expect(defaultMicroGoals(woman('2004-01-01'), today, 2000).calcium).toBe(
      1000,
    );
    expect(defaultMicroGoals(man('2004-01-01'), today, 2000).calcium).toBe(
      1000,
    );
  });

  it('gives women from 51 the postmenopausal iron, and men the same at every age', () => {
    expect(defaultMicroGoals(woman('1976-10-21'), today, 2000).iron).toBe(16);
    expect(defaultMicroGoals(woman('1975-10-20'), today, 2000).iron).toBe(11);
    expect(defaultMicroGoals(woman('1950-01-01'), today, 2000).iron).toBe(11);
    expect(defaultMicroGoals(man('2004-01-01'), today, 2000).iron).toBe(11);
  });

  it('scales thiamin, niacin and saturated fat with the energy', () => {
    const goals = defaultMicroGoals(woman('1990-06-15'), today, 1800);

    expect(goals.thiamin).toBeCloseTo((0.1 * 1800 * 4.184) / 1000);
    expect(goals.niacin).toBeCloseTo((1.6 * 1800 * 4.184) / 1000);
    expect(goals.saturated_fat).toBe(20);
  });

  it('has a goal for every nutrient with a reference value', () => {
    const goals = defaultMicroGoals(man('1950-01-01'), today, 2000);

    expect(Object.keys(goals).sort()).toEqual(
      Object.keys(dietaryReferenceValues).sort(),
    );
  });
});
