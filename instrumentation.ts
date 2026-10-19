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
  const { serverFoodImport } = await import('./lib/data/background-import.ts');
  const { foodImportCron, scheduleFoodImports } = await import(
    './lib/data/food-import-schedule.ts'
  );
  const { registeredSources } = await import('./lib/data/sources/registry.ts');
  const logger = getLogger('db');
  const applied = await migrateToLatest();
  logger.info({ applied }, 'Database migrated');
  const interrupted = await failInterruptedFoodImports(getDatabase(), () =>
    new Date().toISOString(),
  );
  if (interrupted.length > 0) {
    logger.warn({ interrupted }, 'Failed food imports a restart interrupted');
  }
  const pattern = foodImportCron(process.env);
  const importLogger = getLogger('import-foods');
  if (!pattern) {
    importLogger.info('Scheduled food imports are off');
    return;
  }
  const startImport = serverFoodImport(getDatabase());
  scheduleFoodImports({
    pattern,
    logger: importLogger,
    startImport: () => startImport(registeredSources()),
  });
  importLogger.info({ pattern }, 'Scheduled food imports');
};
