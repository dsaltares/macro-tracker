import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@/lib/db/client.ts';
import { inMemory } from '@/lib/db/url.ts';
import { createContext } from './context.ts';

let db: ReturnType<typeof createDatabase>;

beforeEach(() => {
  db = createDatabase(inMemory);
});

afterEach(async () => {
  await db.destroy();
});

describe('createContext', () => {
  it('uses the database it is given', () => {
    expect(createContext({ db }).db).toBe(db);
  });

  it('has no caller until there are accounts', () => {
    expect(createContext({ db }).caller).toBeNull();
  });

  it('mints a fresh id and an ISO timestamp for each write', () => {
    const context = createContext({ db });

    expect(context.nextId()).not.toBe(context.nextId());
    expect(context.now()).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });
});
