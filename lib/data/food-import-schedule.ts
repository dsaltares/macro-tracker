import { Cron } from 'croner';
import type { Logger } from 'pino';

export const defaultFoodImportCron = '0 3 * * SUN#1';

export type ScheduleEnvironment = {
  NODE_ENV?: string;
  FOOD_IMPORT_CRON?: string;
};

export const foodImportCron = ({
  NODE_ENV,
  FOOD_IMPORT_CRON = defaultFoodImportCron,
}: ScheduleEnvironment) => {
  const pattern = FOOD_IMPORT_CRON.trim();
  return NODE_ENV === 'test' || pattern === '' ? undefined : pattern;
};

export type ScheduleFoodImportsOptions = {
  pattern: string;
  startImport: () => Promise<unknown>;
  logger: Logger;
};

export const scheduleFoodImports = ({
  pattern,
  startImport,
  logger,
}: ScheduleFoodImportsOptions) =>
  new Cron(
    pattern,
    {
      catch: (error) => {
        logger.error({ err: error }, 'Scheduled food import failed to start');
      },
    },
    async () => {
      logger.info('Starting the scheduled food import');
      await startImport();
    },
  );
