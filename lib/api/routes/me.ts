import { findAccount } from '../../services/account.ts';
import { apiHandler } from '../handler.ts';

export const meRoute = apiHandler({
  scope: 'read',
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
