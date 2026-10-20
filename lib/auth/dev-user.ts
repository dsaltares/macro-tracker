import type { Profile } from '../domain/profile.ts';

export const devUser = {
  email: 'dev@example.test',
  password: 'macro-tracker-dev',
  name: 'Dev',
} as const;

export const devProfile: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};
