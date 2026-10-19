import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { formatEnvFile, localEnvironment } from './local-env.ts';

describe('localEnvironment', () => {
  it('points the database at this machine', () => {
    expect(
      localEnvironment(
        { DATABASE_URL: '/data/db.sqlite', NEXT_TELEMETRY_DISABLED: '1' },
        {},
        '.data/db.sqlite',
      ),
    ).toEqual({
      DATABASE_URL: '.data/db.sqlite',
      NEXT_TELEMETRY_DISABLED: '1',
    });
  });

  it('drops what only means something in the container', () => {
    expect(
      localEnvironment(
        {
          NODE_ENV: 'production',
          PORT: '3014',
          HOSTNAME: '0.0.0.0',
          BACKUP_DIR: '/data/copy-down',
          DATA_PATH: '/mnt/store/homelab/macro-tracker',
          SOME_API_KEY: 'key_123',
        },
        {},
        '.data/db.sqlite',
      ),
    ).toEqual({
      SOME_API_KEY: 'key_123',
      DATABASE_URL: '.data/db.sqlite',
    });
  });

  it('keeps local settings production does not have, and takes production over the rest', () => {
    expect(
      localEnvironment(
        { SHARED: 'production', EMPTY: null },
        { SHARED: 'local', LOCAL_ONLY: 'local' },
        '.data/db.sqlite',
      ),
    ).toEqual({
      SHARED: 'production',
      LOCAL_ONLY: 'local',
      DATABASE_URL: '.data/db.sqlite',
    });
  });
});

describe('formatEnvFile', () => {
  it('writes values the env file parser reads back unchanged', () => {
    const environment = {
      BARE: 'http://localhost:3014',
      SPACES: 'Macro Tracker <noreply@example.com>',
      HASH: 'a#b',
      APOSTROPHE: "it's",
      EMPTY: '',
    };

    expect(parseEnv(formatEnvFile(environment))).toEqual(environment);
  });

  it('refuses a $, which Next would expand and Node would not', () => {
    expect(() =>
      formatEnvFile({ SECRET: 'p$ss', SOME_API_KEY: 'key_123' }),
    ).toThrow(/^SECRET hold a \$/);
  });
});
