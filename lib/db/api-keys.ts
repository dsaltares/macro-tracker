import type { Kysely } from 'kysely';
import { generateApiKey, hashApiKey, prefixOf } from '../api/keys.ts';
import type { ApiKeyScope, NewApiKey } from '../domain/api-keys.ts';
import type { FoodWriteContext } from './foods.ts';
import type { Database } from './schema.ts';

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  createdAt: string;
};

export type CreatedApiKey = ApiKey & { key: string };

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  last_used_at: string | null;
  created_at: string;
};

const apiKeyColumns = [
  'id',
  'name',
  'prefix',
  'scopes',
  'last_used_at',
  'created_at',
] as const;

const apiKeyOf = (row: ApiKeyRow): ApiKey => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  scopes: JSON.parse(row.scopes) as ApiKeyScope[],
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
});

export const createApiKey = async (
  db: Kysely<Database>,
  userId: string,
  { name, scopes }: NewApiKey,
  { now, nextId }: FoodWriteContext,
): Promise<CreatedApiKey> => {
  const key = generateApiKey();
  const row = await db
    .insertInto('api_keys')
    .values({
      id: nextId(),
      user_id: userId,
      name,
      prefix: prefixOf(key),
      key_hash: hashApiKey(key),
      scopes: JSON.stringify(scopes),
      created_at: now(),
    })
    .returning(apiKeyColumns)
    .executeTakeFirstOrThrow();
  return { ...apiKeyOf(row), key };
};

export const liveApiKeysQuery = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('api_keys')
    .select(apiKeyColumns)
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .orderBy('created_at', 'desc');

export const listApiKeys = async (
  db: Kysely<Database>,
  userId: string,
): Promise<ApiKey[]> =>
  (await liveApiKeysQuery(db, userId).execute()).map(apiKeyOf);

export const apiKeyRevocation = (
  db: Kysely<Database>,
  userId: string,
  apiKeyId: string,
  revokedAt: string,
) =>
  db
    .updateTable('api_keys')
    .set({ revoked_at: revokedAt })
    .where('id', '=', apiKeyId)
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null);

export const revokeApiKey = async (
  db: Kysely<Database>,
  userId: string,
  apiKeyId: string,
  revokedAt: string,
) => {
  const { numUpdatedRows } = await apiKeyRevocation(
    db,
    userId,
    apiKeyId,
    revokedAt,
  ).executeTakeFirst();
  return numUpdatedRows > 0n;
};
