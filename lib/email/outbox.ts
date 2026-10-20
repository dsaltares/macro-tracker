import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../logger.ts';
import type { EmailMessage, SendEmail } from './transport.ts';

const logger = getLogger('email');

const messageExtension = '.json';

const partialExtension = '.partial';

const sequenceDigits = 10;

const messageFileName = (sequence: number) =>
  `${Date.now()}-${String(sequence).padStart(sequenceDigits, '0')}-${randomUUID()}${messageExtension}`;

const writeAtomically = async (path: string, contents: string) => {
  const partial = `${path}${partialExtension}`;
  await writeFile(partial, contents);
  await rename(partial, path);
};

export const createOutboxTransport = (
  directory: string,
  next: SendEmail,
): SendEmail => {
  let sent = 0;
  return async (message) => {
    try {
      await mkdir(directory, { recursive: true });
      await writeAtomically(
        join(directory, messageFileName(++sent)),
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
};

export const readOutbox = async (directory: string) => {
  const names = (await readdir(directory).catch(() => []))
    .filter((name) => name.endsWith(messageExtension))
    .sort();
  return Promise.all(
    names.map(
      async (name) =>
        JSON.parse(
          await readFile(join(directory, name), 'utf8'),
        ) as EmailMessage,
    ),
  );
};
