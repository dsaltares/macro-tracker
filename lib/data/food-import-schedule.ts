import { Cron } from 'croner';
import type { Logger } from 'pino';

export const defaultFoodImportCron = '0 3 * * SUN#1';
export const defaultFoodDeltaCron = '0 4 * * *';

export type ScheduleEnvironment = {
  NODE_ENV?: string;
  FOOD_IMPORT_CRON?: string;
  FOOD_DELTA_CRON?: string;
};

const cronPattern = (nodeEnv: string | undefined, value: string) => {
  const pattern = value.trim();
  return nodeEnv === 'test' || pattern === '' ? undefined : pattern;
};

export const foodImportCron = ({
  NODE_ENV,
  FOOD_IMPORT_CRON = defaultFoodImportCron,
}: ScheduleEnvironment) => cronPattern(NODE_ENV, FOOD_IMPORT_CRON);

export const foodDeltaCron = ({
  NODE_ENV,
  FOOD_DELTA_CRON = defaultFoodDeltaCron,
}: ScheduleEnvironment) => cronPattern(NODE_ENV, FOOD_DELTA_CRON);

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
