import { findAccount } from '../../services/account.ts';
import { apiHandler } from '../handler.ts';
import { account } from '../schemas.ts';

export const meRoute = apiHandler({
  method: 'GET',
  path: '/me',
  operationId: 'getMe',
  summary: 'Who am I',
  description:
    "The account the key belongs to, its profile, and the key's own name, prefix and scopes. Call it first to check a key works and see what it may do.",
  scope: 'read',
  output: account,
  example: {
    response: {
      id: '0f9e8d7c-6b5a-4f3e-2d1c-0b9a8f7e6d5c',
      email: 'ana@example.com',
      name: 'Ana',
      profile: {
        sex: 'female',
        birthDate: '1990-04-02',
        heightCm: 168,
        activityLevel: 'moderate',
      },
      apiKey: { name: 'Shortcuts', prefix: 'mt_3kF9x', scopes: ['read'] },
    },
  },
  handle: async ({ context, apiKey }) => {
    const { id, email, name, profile } = await findAccount(context);
    return {
      id,
      email,
      name,
      profile: profile && {
        sex: profile.sex,
        birthDate: profile.birthDate,
        heightCm: profile.heightCm,
        activityLevel: profile.activityLevel,
      },
      apiKey: {
        name: apiKey.name,
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
      },
    };
  },
});
