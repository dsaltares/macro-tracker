import type { BetterAuthOptions } from 'better-auth';

export const googleProviderId = 'google';

export const credentialProviderId = 'credential';

export type GoogleOptions = NonNullable<
  NonNullable<BetterAuthOptions['socialProviders']>['google']
>;

type Environment = Record<string, string | undefined>;

export const googleOptions = (
  environment: Environment = process.env,
): GoogleOptions | undefined => {
  const clientId = environment.GOOGLE_CLIENT_ID;
  const clientSecret = environment.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
};

export const googleConfigured = (environment: Environment = process.env) =>
  !!googleOptions(environment);
