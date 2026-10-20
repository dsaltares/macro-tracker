export const devBaseUrl = 'http://localhost:3014';

export const missingBaseUrlMessage =
  'BETTER_AUTH_URL must be set in production. Without it Better Auth takes its origin, and every link it mails, from the request Host header.';

export const authBaseUrl = (
  configured = process.env.BETTER_AUTH_URL,
  production = process.env.NODE_ENV === 'production',
) => {
  if (configured) {
    return configured;
  }
  if (production) {
    throw new Error(missingBaseUrlMessage);
  }
  return devBaseUrl;
};
