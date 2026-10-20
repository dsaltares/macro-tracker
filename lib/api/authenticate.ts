import type { Kysely } from 'kysely';
import { findApiKeyByHash, recordApiKeyUse } from '../db/api-keys.ts';
import type { Database } from '../db/schema.ts';
import type { ApiKeyScope } from '../domain/api-keys.ts';
import type { ApiError } from './errors.ts';
import { apiKeyMarker, hashApiKey } from './keys.ts';

export const lastUsedResolutionMs = 60_000;

const bearerScheme = /^Bearer +(\S+)$/i;

export type AuthenticatedApiKey = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
};

export type Authentication =
  | { authenticated: true; apiKey: AuthenticatedApiKey }
  | { authenticated: false; error: ApiError };

const refused = (error: ApiError): Authentication => ({
  authenticated: false,
  error,
});

export const missingApiKey: ApiError = {
  code: 'MISSING_API_KEY',
  message: 'Send an API key as Authorization: Bearer <key>.',
};

export const invalidApiKey: ApiError = {
  code: 'INVALID_API_KEY',
  message: 'The API key is not valid.',
};

export const revokedApiKey: ApiError = {
  code: 'REVOKED_API_KEY',
  message: 'The API key has been revoked.',
};

const invalidKey = refused(invalidApiKey);

const unlessUsedSince = (now: string) =>
  new Date(Date.parse(now) - lastUsedResolutionMs).toISOString();

export const authenticate = async (
  headers: Headers,
  { db, now }: { db: Kysely<Database>; now: () => string },
): Promise<Authentication> => {
  const authorization = headers.get('authorization');
  if (authorization === null) {
    return refused(missingApiKey);
  }
  const key = bearerScheme.exec(authorization.trim())?.[1];
  if (!key?.startsWith(apiKeyMarker)) {
    return invalidKey;
  }
  const stored = await findApiKeyByHash(db, hashApiKey(key));
  if (stored === null) {
    return invalidKey;
  }
  if (stored.revokedAt !== null) {
    return refused(revokedApiKey);
  }
  const usedAt = now();
  await recordApiKeyUse(db, stored.id, usedAt, unlessUsedSince(usedAt));
  const { revokedAt: _, ...apiKey } = stored;
  return { authenticated: true, apiKey };
};
