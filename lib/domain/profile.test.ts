import { describe, expect, it } from 'vitest';
import {
  activityLevels,
  activityMultipliers,
  ageOn,
  birthDateOutOfRange,
  type Profile,
  profileSchema,
  profileSchemaOn,
} from './profile.ts';

const profile: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};

const today = '2026-10-20';

const errorsOf = (input: unknown, on = today) =>
  profileSchemaOn(on)
    .safeParse(input)
    .error?.issues.map(({ path, message }) => ({ path, message })) ?? [];

describe('activityMultipliers', () => {
  it('runs from 1.2 for sedentary to 1.9 for very active, rising with each level', () => {
    const multipliers = activityLevels.map(
      (level) => activityMultipliers[level],
    );

    expect(multipliers).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
  });
});

describe('ageOn', () => {
  it('counts a birthday that has not come yet this year as a year short', () => {
    expect(ageOn('1990-10-21', today)).toBe(35);
  });

  it('counts the birthday itself as the year completed', () => {
    expect(ageOn('1990-10-20', today)).toBe(36);
  });

  it('counts a leap day birthday on the first of March in other years', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });
});

describe('profileSchemaOn', () => {
  it('accepts a complete profile', () => {
    expect(profileSchemaOn(today).parse(profile)).toEqual(profile);
  });

  it('accepts someone turning the minimum age today, and not a day earlier', () => {
    expect(errorsOf({ ...profile, birthDate: '2010-10-20' })).toEqual([]);
    expect(errorsOf({ ...profile, birthDate: '2010-10-21' })).toEqual([
      { path: ['birthDate'], message: birthDateOutOfRange },
    ]);
  });

  it('refuses a birth date in the future or too long ago', () => {
    expect(errorsOf({ ...profile, birthDate: '2027-01-01' })).toEqual([
      { path: ['birthDate'], message: birthDateOutOfRange },
    ]);
    expect(errorsOf({ ...profile, birthDate: '1900-01-01' })).toEqual([
      { path: ['birthDate'], message: birthDateOutOfRange },
    ]);
  });

  it('refuses a date that is not on the calendar', () => {
    expect(errorsOf({ ...profile, birthDate: '1990-02-30' })).toEqual([
      { path: ['birthDate'], message: 'Enter your date of birth.' },
    ]);
  });

  it('keeps the height between 100 and 250 cm', () => {
    expect(errorsOf({ ...profile, heightCm: 99.5 })).toEqual([
      { path: ['heightCm'], message: 'Enter a height of at least 100 cm.' },
    ]);
    expect(errorsOf({ ...profile, heightCm: 251 })).toEqual([
      { path: ['heightCm'], message: 'Enter a height of at most 250 cm.' },
    ]);
    expect(errorsOf({ ...profile, heightCm: 172.5 })).toEqual([]);
  });

  it('asks for every field it is missing', () => {
    expect(errorsOf({ heightCm: Number.NaN })).toEqual([
      { path: ['sex'], message: 'Choose your sex.' },
      { path: ['birthDate'], message: 'Enter your date of birth.' },
      { path: ['heightCm'], message: 'Enter your height in cm.' },
      { path: ['activityLevel'], message: 'Choose your activity level.' },
    ]);
  });
});

describe('profileSchema', () => {
  it('does not judge the age, which needs a today', () => {
    expect(
      profileSchema.safeParse({ ...profile, birthDate: '2027-01-01' }).success,
    ).toBe(true);
  });
});
