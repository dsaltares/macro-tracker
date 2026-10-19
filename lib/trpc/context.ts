import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
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
  db?: Kysely<Database>;
};

export const createContext = ({
  db = getDatabase(),
}: ContextOptions = {}): Context => ({
  db,
  caller: null,
  now: () => new Date().toISOString(),
  nextId: () => randomUUID(),
});
