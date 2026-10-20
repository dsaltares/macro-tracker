import { meRoute } from '@/lib/api/routes/me';
import { apiServer } from '@/lib/api/server';

export const GET = (request: Request) => meRoute(apiServer())(request);
