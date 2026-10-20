import { termsNotAccepted, termsRequired } from './credentials.ts';

export const somethingWentWrong =
  'Something went wrong on our side. Try again in a moment.';

export const resetLinkExpired =
  'That reset link has expired or has already been used. Ask for a new one.';

export const confirmationLinkExpired =
  'That confirmation link has expired or has been used already. Ask for a new one below.';

const tooManyAttempts = 'Too many attempts. Wait a few minutes and try again.';

const tooManyRequests = 429;

const codeMessages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'That email and password do not match an account.',
  USER_NOT_FOUND: 'That email and password do not match an account.',
  INVALID_EMAIL: 'That does not look like an email address.',
  INVALID_TOKEN: resetLinkExpired,
  EMAIL_NOT_VERIFIED:
    'Confirm your email address before signing in. The link is in your inbox.',
  PASSWORD_TOO_SHORT: 'That password is too short.',
  PASSWORD_TOO_LONG: 'That password is too long.',
  [termsNotAccepted]: termsRequired,
};

export type AuthError = {
  code?: string | undefined;
  status?: number | undefined;
};

export const authErrorMessage = (error: AuthError | undefined) => {
  const known = error?.code ? codeMessages[error.code] : undefined;
  if (known) {
    return known;
  }
  return error?.status === tooManyRequests
    ? tooManyAttempts
    : somethingWentWrong;
};

const verificationErrors = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN']);

export const verificationErrorMessage = (code: string) =>
  verificationErrors.has(code) ? confirmationLinkExpired : somethingWentWrong;
