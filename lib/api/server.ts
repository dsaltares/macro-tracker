import { v7 } from 'uuid';
import { getDatabase } from '../db/client.ts';
import { getLogger } from '../logger.ts';
import type { ApiServer } from './handler.ts';

export const apiServer = (): ApiServer => ({
  db: getDatabase(),
  now: () => new Date().toISOString(),
  nextId: v7,
  logger: getLogger('api'),
});
