import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../logger.ts';
import type { EmailMessage, SendEmail } from './transport.ts';

const logger = getLogger('email');

const messageFileName = () => `${Date.now()}-${randomUUID()}.json`;

export const createOutboxTransport =
  (directory: string, next: SendEmail): SendEmail =>
  async (message) => {
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, messageFileName()),
        JSON.stringify(message),
      );
    } catch (error) {
      logger.error(
        { err: error, to: message.to, directory },
        'Email not written to the outbox',
      );
    }
    return next(message);
  };

export const readOutbox = async (directory: string) => {
  const names = (await readdir(directory).catch(() => [])).sort();
  return Promise.all(
    names.map(
      async (name) =>
        JSON.parse(
          await readFile(join(directory, name), 'utf8'),
        ) as EmailMessage,
    ),
  );
};
