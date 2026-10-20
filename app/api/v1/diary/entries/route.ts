import { addEntryRoute } from '@/lib/api/routes/diary';
import { apiServer } from '@/lib/api/server';

export const POST = (request: Request) => addEntryRoute(apiServer())(request);
