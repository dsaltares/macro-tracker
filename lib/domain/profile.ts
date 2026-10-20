import { z } from 'zod';

export const sexes = ['female', 'male'] as const;

export type Sex = (typeof sexes)[number];

export const activityLevels = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
] as const;

export type ActivityLevel = (typeof activityLevels)[number];

export const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const minAge = 16;
export const maxAge = 120;

export const minHeightCm = 100;
export const maxHeightCm = 250;

export const ageOn = (birthDate: string, today: string) => {
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  const hadBirthday = today.slice(5, 10) >= birthDate.slice(5, 10);
  return hadBirthday ? years : years - 1;
};

export const isPlausibleBirthDate = (birthDate: string, today: string) => {
  const age = ageOn(birthDate, today);
  return age >= minAge && age <= maxAge;
};

export const birthDateOutOfRange = `You need to be between ${minAge} and ${maxAge} years old.`;

export const profileSchema = z.object({
  sex: z.enum(sexes, { error: 'Choose your sex.' }),
  birthDate: z.iso.date({ error: 'Enter your date of birth.' }),
  heightCm: z
    .number({ error: 'Enter your height in cm.' })
    .min(minHeightCm, `Enter a height of at least ${minHeightCm} cm.`)
    .max(maxHeightCm, `Enter a height of at most ${maxHeightCm} cm.`),
  activityLevel: z.enum(activityLevels, {
    error: 'Choose your activity level.',
  }),
});

export type Profile = z.infer<typeof profileSchema>;

export const profileSchemaOn = (today: string) =>
  profileSchema.refine(
    ({ birthDate }) => isPlausibleBirthDate(birthDate, today),
    { message: birthDateOutOfRange, path: ['birthDate'] },
  );
