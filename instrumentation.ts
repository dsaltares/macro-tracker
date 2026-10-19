export const register = async () => {
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  ) {
    return;
  }
  const { getLogger } = await import('./lib/logger.ts');
  const { migrateToLatest } = await import('./lib/db/migrator.ts');
  const { getDatabase } = await import('./lib/db/client.ts');
  const { failInterruptedFoodImports } = await import(
    './lib/db/food-imports.ts'
  );
  const logger = getLogger('db');
  const applied = await migrateToLatest();
  logger.info({ applied }, 'Database migrated');
  const interrupted = await failInterruptedFoodImports(getDatabase(), () =>
    new Date().toISOString(),
  );
  if (interrupted.length > 0) {
    logger.warn({ interrupted }, 'Failed food imports a restart interrupted');
  }
};
