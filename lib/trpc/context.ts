import type { Kysely } from 'kysely';
import { v7 } from 'uuid';
import type { Auth } from '../auth/auth.ts';
import { resolveCaller } from '../auth/caller.ts';
import { getDatabase } from '../db/client.ts';
import type { Database } from '../db/schema.ts';
import type { Caller } from '../services/context.ts';

export type { Caller };

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
  nextId: v7,
});
