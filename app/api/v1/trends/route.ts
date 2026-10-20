import { trendsRoute } from '@/lib/api/routes/trends';
import { apiServer } from '@/lib/api/server';

export const GET = (request: Request) => trendsRoute(apiServer())(request);
