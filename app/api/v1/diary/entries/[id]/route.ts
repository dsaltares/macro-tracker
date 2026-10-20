import { removeEntryRoute, updateEntryRoute } from '@/lib/api/routes/diary';
import { apiServer } from '@/lib/api/server';

type EntryContext = { params: Promise<{ id: string }> };

export const PATCH = (request: Request, context: EntryContext) =>
  updateEntryRoute(apiServer())(request, context);

export const DELETE = (request: Request, context: EntryContext) =>
  removeEntryRoute(apiServer())(request, context);
