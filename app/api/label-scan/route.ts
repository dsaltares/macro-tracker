import { getLabelReader } from '@/lib/ai/server';
import { resolveCaller } from '@/lib/auth/caller';
import { labelScanRoute } from '@/lib/label-scan/route';
import { getLogger } from '@/lib/logger';

export const POST = (request: Request) =>
  labelScanRoute({
    readLabel: getLabelReader()?.readLabel ?? null,
    resolveCaller,
    logger: getLogger('label-scan'),
  })(request);
