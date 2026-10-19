import { afterEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from './url.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('databaseUrl', () => {
  it('reads DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', '/data/db.sqlite');

    expect(databaseUrl()).toBe('/data/db.sqlite');
  });

  it('falls back to a file under .data/ when DATABASE_URL is unset', () => {
    vi.stubEnv('DATABASE_URL', '');

    expect(databaseUrl()).toBe('.data/db.sqlite');
  });
});
