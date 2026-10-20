import type { Kysely } from 'kysely';
import { credentialProviderId, googleProviderId } from '../auth/google.ts';
import type { Database } from './schema.ts';

export const signInMethods = ['password', 'google'] as const;

export type SignInMethod = (typeof signInMethods)[number];

export type SignInMethods = Record<SignInMethod, boolean>;

const providerOf: Record<SignInMethod, string> = {
  password: credentialProviderId,
  google: googleProviderId,
};

export const signInMethodsQuery = (db: Kysely<Database>, userId: string) =>
  db.selectFrom('accounts').select('provider_id').where('user_id', '=', userId);

export const findSignInMethods = async (
  db: Kysely<Database>,
  userId: string,
): Promise<SignInMethods> => {
  const providers = new Set(
    (await signInMethodsQuery(db, userId).execute()).map(
      ({ provider_id }) => provider_id,
    ),
  );
  return {
    password: providers.has(providerOf.password),
    google: providers.has(providerOf.google),
  };
};

export type NewPassword = {
  id: string;
  passwordHash: string;
  now: string;
};

export const passwordCreation = (
  db: Kysely<Database>,
  userId: string,
  { id, passwordHash, now }: NewPassword,
) =>
  db
    .insertInto('accounts')
    .columns([
      'id',
      'user_id',
      'account_id',
      'provider_id',
      'password',
      'created_at',
      'updated_at',
    ])
    .expression(
      db
        .selectNoFrom((eb) => [
          eb.val(id).as('id'),
          eb.val(userId).as('user_id'),
          eb.val(userId).as('account_id'),
          eb.val(providerOf.password).as('provider_id'),
          eb.val(passwordHash).as('password'),
          eb.val(now).as('created_at'),
          eb.val(now).as('updated_at'),
        ])
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom('accounts')
                .select('id')
                .where('user_id', '=', userId)
                .where('provider_id', '=', providerOf.password),
            ),
          ),
        ),
    );

export const setPassword = async (
  db: Kysely<Database>,
  userId: string,
  password: NewPassword,
) => {
  const { numInsertedOrUpdatedRows } = await passwordCreation(
    db,
    userId,
    password,
  ).executeTakeFirstOrThrow();
  return (numInsertedOrUpdatedRows ?? 0n) > 0n;
};

export const signInMethodDisconnection = (
  db: Kysely<Database>,
  userId: string,
  method: SignInMethod,
) =>
  db
    .deleteFrom('accounts')
    .where('user_id', '=', userId)
    .where('provider_id', '=', providerOf[method])
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('accounts as other')
          .select('other.id')
          .where('other.user_id', '=', userId)
          .where('other.provider_id', '!=', providerOf[method]),
      ),
    );

export type Disconnection = 'disconnected' | 'not-connected' | 'last-method';

export const disconnectSignInMethod = async (
  db: Kysely<Database>,
  userId: string,
  method: SignInMethod,
): Promise<Disconnection> => {
  const { numDeletedRows } = await signInMethodDisconnection(
    db,
    userId,
    method,
  ).executeTakeFirstOrThrow();
  if (numDeletedRows > 0n) {
    return 'disconnected';
  }
  return (await findSignInMethods(db, userId))[method]
    ? 'last-method'
    : 'not-connected';
};
