import { copyMealRoute } from '@/lib/api/routes/diary';
import { apiServer } from '@/lib/api/server';

export const POST = (request: Request) => copyMealRoute(apiServer())(request);
