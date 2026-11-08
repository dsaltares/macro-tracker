import { getLabelReader } from '@/lib/ai/server';
import { resolveCaller } from '@/lib/auth/caller';
import { getDatabase } from '@/lib/db/client';
import { labelScanRoute } from '@/lib/label-scan/route';
import { getLogger } from '@/lib/logger';

export const POST = (request: Request) =>
  labelScanRoute({
    readLabel: getLabelReader()?.readLabel ?? null,
    resolveCaller,
    db: getDatabase(),
    logger: getLogger('label-scan'),
  })(request);
