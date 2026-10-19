import pino from 'pino';
import pinoPretty from 'pino-pretty';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino(
  { level: isProduction ? 'info' : 'debug' },
  isProduction ? undefined : pinoPretty({ colorize: true }),
);

export const getLogger = (module: string) => logger.child({ module });
