import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.ts';

export type Caller = { userId: string };

export type ServiceContext = {
  db: Kysely<Database>;
  caller: Caller;
  now: () => string;
  nextId: () => string;
};
