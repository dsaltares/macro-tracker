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
import { maxPasswordLength, minPasswordLength } from './credentials.ts';
import { usesGoogleCode } from './errors.ts';
import {
  credentialProviderId,
  type GoogleOptions,
  googleOptions,
  googleProviderId,
} from './google.ts';

const day = 60 * 60 * 24;

export const sessionExpiresIn = 400 * day;

export const sessionUpdateAge = day;

const defaultLimitRequests = () =>
  process.env.DISABLE_AUTH_RATE_LIMIT !== '1' &&
  process.env.NODE_ENV === 'production';

const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' };

const signInEmailPath = '/sign-in/email';

export type AuthOptions = {
  db?: Kysely<Database>;
  secret?: string | undefined;
  baseUrl?: string;
  sendEmail?: SendEmail;
  limitRequests?: boolean;
  google?: GoogleOptions | undefined;
};

export const createAuth = ({
  db = getDatabase(),
  secret = process.env.BETTER_AUTH_SECRET,
  baseUrl = authBaseUrl(),
  sendEmail = sendEmailThroughTransport,
  limitRequests = defaultLimitRequests(),
  google = googleOptions(),
}: AuthOptions = {}) =>
  betterAuth({
    database: { db, type: 'sqlite' },
    ...(secret ? { secret } : {}),
    baseURL: baseUrl,
    user: {
      modelName: 'users',
      fields: { emailVerified: 'email_verified', ...timestamps },
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
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        requireLocalEmailVerified: false,
        allowDifferentEmails: false,
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
    socialProviders: google ? { [googleProviderId]: google } : {},
    databaseHooks: {
      account: {
        create: {
          after: async (account, ctx) => {
            if (account.providerId === credentialProviderId || !ctx) {
              return;
            }
            const { internalAdapter } = ctx.context;
            const owner = await internalAdapter.findUserById(account.userId);
            if (owner?.emailVerified) {
              return;
            }
            const unconfirmedPasswords = (
              await internalAdapter.findAccounts(account.userId)
            ).filter(({ providerId }) => providerId === credentialProviderId);
            for (const { id } of unconfirmedPasswords) {
              await internalAdapter.deleteAccount(id);
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path !== signInEmailPath ||
          typeof ctx.body?.email !== 'string'
        ) {
          return;
        }
        const found = await ctx.context.internalAdapter.findUserByEmail(
          ctx.body.email.toLowerCase(),
          { includeAccounts: true },
        );
        const providers = found?.accounts.map(({ providerId }) => providerId);
        if (
          providers?.includes(googleProviderId) &&
          !providers.includes(credentialProviderId)
        ) {
          throw new APIError('UNAUTHORIZED', {
            code: usesGoogleCode,
            message: 'This account signs in with Google.',
          });
        }
      }),
    },
  });

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

export const getAuth = () => {
  instance ??= createAuth();
  return instance;
};
