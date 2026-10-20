import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { Kysely } from 'kysely';
import { getDatabase } from '../db/client.ts';
import type { Database } from '../db/schema.ts';
import { sendEmail as sendEmailThroughTransport } from '../email/send.ts';
import { resetPasswordEmail } from '../email/templates/reset-password.tsx';
import { verifyAddressEmail } from '../email/templates/verify-address.tsx';
import type { SendEmail } from '../email/transport.ts';
import { authBaseUrl } from './base-url.ts';
import {
  maxPasswordLength,
  minPasswordLength,
  termsNotAccepted,
} from './credentials.ts';

const day = 60 * 60 * 24;

export const sessionExpiresIn = 400 * day;

export const sessionUpdateAge = day;

const defaultLimitRequests = () =>
  process.env.DISABLE_AUTH_RATE_LIMIT !== '1' &&
  process.env.NODE_ENV === 'production';

const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' };

const emailSignUpPath = '/sign-up/email';

const requireTermsOnSignUp = createAuthMiddleware(async (ctx) => {
  if (ctx.path === emailSignUpPath && ctx.body?.termsAccepted !== true) {
    throw new APIError('BAD_REQUEST', {
      code: termsNotAccepted,
      message: 'Agreeing to the terms is required to create an account.',
    });
  }
});

export type AuthOptions = {
  db?: Kysely<Database>;
  secret?: string | undefined;
  baseUrl?: string;
  sendEmail?: SendEmail;
  limitRequests?: boolean;
};

export const createAuth = ({
  db = getDatabase(),
  secret = process.env.BETTER_AUTH_SECRET,
  baseUrl = authBaseUrl(),
  sendEmail = sendEmailThroughTransport,
  limitRequests = defaultLimitRequests(),
}: AuthOptions = {}) =>
  betterAuth({
    database: { db, type: 'sqlite' },
    ...(secret ? { secret } : {}),
    baseURL: baseUrl,
    user: {
      modelName: 'users',
      fields: { emailVerified: 'email_verified', ...timestamps },
      additionalFields: {
        termsAcceptedAt: {
          type: 'date',
          required: false,
          input: false,
          fieldName: 'terms_accepted_at',
        },
      },
    },
    hooks: { before: requireTermsOnSignUp },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) =>
            ctx?.path === emailSignUpPath
              ? { data: { ...user, termsAcceptedAt: new Date() } }
              : { data: user },
        },
      },
    },
    session: {
      modelName: 'sessions',
      expiresIn: sessionExpiresIn,
      updateAge: sessionUpdateAge,
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        ...timestamps,
      },
    },
    account: {
      modelName: 'accounts',
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        ...timestamps,
      },
    },
    verification: {
      modelName: 'verifications',
      fields: { expiresAt: 'expires_at', ...timestamps },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength,
      maxPasswordLength,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(await resetPasswordEmail({ to: user.email, url }));
      },
    },
    rateLimit: { enabled: limitRequests },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(await verifyAddressEmail({ to: user.email, url }));
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

export const getAuth = () => {
  instance ??= createAuth();
  return instance;
};
