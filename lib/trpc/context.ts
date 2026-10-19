import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Auth } from '../auth/auth.ts';
import { resolveCaller } from '../auth/caller.ts';
import { getDatabase } from '../db/client.ts';
import type { Database } from '../db/schema.ts';

export type Caller = { userId: string };

export type Context = {
  db: Kysely<Database>;
  caller: Caller | null;
  now: () => string;
  nextId: () => string;
};

export type ContextOptions = {
  headers: Headers;
  db?: Kysely<Database>;
  auth?: Auth;
};

export const createContext = async ({
  headers,
  db = getDatabase(),
  auth,
}: ContextOptions): Promise<Context> => ({
  db,
  caller: await resolveCaller(headers, auth),
  now: () => new Date().toISOString(),
  nextId: () => randomUUID(),
});
