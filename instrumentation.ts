export const register = async () => {
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  ) {
    return;
  }
  const { getLogger } = await import('./lib/logger.ts');
  const { migrateToLatest } = await import('./lib/db/migrator.ts');
  const applied = await migrateToLatest();
  getLogger('db').info({ applied }, 'Database migrated');
};
