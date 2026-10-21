import { copyEntryRoute } from '@/lib/api/routes/diary';
import { apiServer } from '@/lib/api/server';

type EntryContext = { params: Promise<{ id: string }> };

export const POST = (request: Request, context: EntryContext) =>
  copyEntryRoute(apiServer())(request, context);
