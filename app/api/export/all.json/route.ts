import { resolveCaller } from '@/lib/auth/caller';
import { getDatabase } from '@/lib/db/client';
import { exportRoutes } from '@/lib/export/routes';

export const GET = (request: Request) =>
  exportRoutes({
    db: getDatabase(),
    now: () => new Date().toISOString(),
    resolveCaller,
  }).allJson(request);
