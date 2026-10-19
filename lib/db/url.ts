const defaultDatabaseUrl = '.data/db.sqlite';

export const inMemory = ':memory:';

export const databaseUrl = () => process.env.DATABASE_URL || defaultDatabaseUrl;
