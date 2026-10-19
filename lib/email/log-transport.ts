import { getLogger } from '../logger.ts';
import type { SendEmail } from './transport.ts';

export type LogLine = (line: string) => void;

export const loggedId = 'logged';

const logger = getLogger('email');

const logToPino: LogLine = (line) => logger.info(line);

export const createLogTransport = (
  reason: string,
  log: LogLine = logToPino,
): SendEmail => {
  return ({ to, subject, text }) => {
    log(
      [
        `Email not sent (${reason}), printed instead`,
        `  to: ${to}`,
        `  subject: ${subject}`,
        '',
        text,
      ].join('\n'),
    );
    return Promise.resolve({ delivered: true, id: loggedId });
  };
};
